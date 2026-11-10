const { AuditLogEvent, PermissionFlagsBits } = require("discord.js");
const Asset = require("../../database/models/AntiRaidVisualAsset");
const { getAntiRaidConfig, updateAntiRaidConfig } = require("./store");
const { sendModuleAlert } = require("./alert");
const { findAuditEntry, isAuthorized } = require("./audit");
const { punish } = require("./engine");
const { VS_FIELDS, VS_RESPONSES } = require("./defaults");

// Visual do servidor: guarda uma referência (nome, descrição e imagens) e desfaz
// alterações feitas por quem não está autorizado. Mudanças de pessoas autorizadas
// viram a nova referência automaticamente.

const KINDS = Object.keys(VS_FIELDS);
const IMAGES = ["icon", "banner", "splash", "discoverySplash"];
const MAX_BYTES = 8 * 1024 * 1024; // acima disso a imagem não é guardada (cai no endereço do Discord)
const REASON = "Anti-Raid: visual do servidor alterado sem autorização";

// Chave de cada campo no registro de auditoria
const AUDIT_KEY = {
  name: "name",
  icon: "icon_hash",
  banner: "banner_hash",
  splash: "splash_hash",
  discoverySplash: "discovery_splash_hash",
  description: "description",
};

const URL_OF = {
  icon: (g) => g.iconURL({ size: 1024 }),
  banner: (g) => g.bannerURL({ size: 1024 }),
  splash: (g) => g.splashURL({ size: 1024 }),
  discoverySplash: (g) => g.discoverySplashURL({ size: 1024 }),
};

const norm = (value) => (value === undefined || value === "" ? null : value);

async function download(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length <= MAX_BYTES ? buf : null;
  } catch {
    return null;
  }
}

async function loadImage(guildId, kind, hash) {
  const doc = await Asset.findOne({ guildId, kind, hash }).lean().catch(() => null);
  return doc ? Buffer.from(doc.data, "base64") : null;
}

// Salva (ou atualiza) a referência dos campos pedidos. Os demais campos ficam como estavam.
// Devolve { snap, failed }: failed lista as imagens que não deu para guardar.
async function takeSnapshot(guild, kinds = KINDS) {
  const cfg = await getAntiRaidConfig(guild.id);
  const snap = { ...(cfg.visual.snapshot ?? {}) };
  const failed = [];

  for (const kind of kinds) {
    snap[kind] = norm(guild[kind]);
    if (!IMAGES.includes(kind)) continue;

    if (!snap[kind]) {
      await Asset.deleteOne({ guildId: guild.id, kind }).catch(() => {});
      continue;
    }
    const have = await Asset.exists({ guildId: guild.id, kind, hash: snap[kind] }).catch(() => null);
    if (have) continue;

    const buf = await download(URL_OF[kind](guild));
    const saved = buf
      ? await Asset.findOneAndUpdate(
          { guildId: guild.id, kind },
          { hash: snap[kind], data: buf.toString("base64") },
          { upsert: true, setDefaultsOnInsert: true }
        )
          .then(() => true)
          .catch(() => false)
      : false;
    if (!saved) {
      failed.push(kind);
      await Asset.deleteOne({ guildId: guild.id, kind }).catch(() => {});
    }
  }

  snap.savedAt = Date.now();
  await updateAntiRaidConfig(guild.id, { "visual.snapshot": snap });
  return { snap, failed };
}

// Volta os campos pedidos ao que está na referência. `fallback` é o servidor como estava
// antes da alteração: serve para pegar a imagem pelo endereço antigo quando ela não foi guardada.
async function restore(guild, snap, fields, fallback = null) {
  const data = {};
  const failed = [];

  for (const kind of fields) {
    if (!IMAGES.includes(kind)) {
      data[kind] = snap[kind] ?? null;
      continue;
    }
    if (!snap[kind]) {
      data[kind] = null;
      continue;
    }
    const buf = await loadImage(guild.id, kind, snap[kind]);
    const url = fallback && fallback[kind] === snap[kind] ? URL_OF[kind](fallback) : null;
    if (buf || url) data[kind] = buf ?? url;
    else failed.push(kind);
  }

  const keys = Object.keys(data);
  if (!keys.length) return { done: [], failed };

  const done = await guild
    .edit(data, REASON)
    .then(() => keys)
    .catch(async () => {
      // Se o conjunto falhou, tenta um por vez para salvar o que der
      const ok = [];
      for (const key of keys) {
        if (await guild.edit({ [key]: data[key] }, REASON).then(() => true).catch(() => false)) ok.push(key);
        else failed.push(key);
      }
      return ok;
    });
  return { done, failed };
}

// ---- Evento ----

const queues = new Map(); // guildId -> fila para tratar um evento de cada vez
const run = (guildId, task) => {
  const next = (queues.get(guildId) ?? Promise.resolve()).then(task, task);
  queues.set(guildId, next.catch(() => {}));
  return next;
};

async function handle(oldGuild, guild) {
  const cfg = await getAntiRaidConfig(guild.id);
  const v = cfg.visual;
  if (!v.enabled) return;

  const changed = KINDS.filter((k) => norm(oldGuild[k]) !== norm(guild[k]));
  if (!changed.length) return;

  // Campos que não estão protegidos só atualizam a referência, em silêncio
  const outside = changed.filter((k) => !v.protect.includes(k));
  const inside = changed.filter((k) => v.protect.includes(k));
  if (outside.length && v.snapshot) await takeSnapshot(guild, outside);
  if (!inside.length) return;

  const entry = await findAuditEntry(
    guild,
    AuditLogEvent.GuildUpdate,
    (e) => e.targetId === guild.id && e.changes?.some((c) => inside.some((k) => AUDIT_KEY[k] === c.key))
  );
  const executorId = entry?.executorId ?? null;
  if (executorId === guild.client.user.id) return; // foi o próprio bot desfazendo

  if (executorId && (await isAuthorized(guild, executorId, { users: v.authorizedUsers, roles: v.authorizedRoles }))) {
    await takeSnapshot(guild, inside); // mudança autorizada vira a nova referência
    return;
  }

  // Sem referência ainda: usa o servidor como estava antes da mudança
  const snap = v.snapshot ?? Object.fromEntries(KINDS.map((k) => [k, norm(oldGuild[k])]));
  const response = VS_RESPONSES[v.response] ?? VS_RESPONSES.revert;
  const differing = inside.filter((k) => norm(snap[k]) !== norm(guild[k]));
  if (!differing.length) return; // já está igual à referência (por exemplo, depois da nossa reversão)

  let result = "não solicitada";
  if (response.revert) {
    const { done, failed } = await restore(guild, snap, differing, oldGuild);
    const parts = [];
    if (done.length) parts.push(`revertido: ${done.map((k) => VS_FIELDS[k]).join(", ")}`);
    if (failed.length) parts.push(`não consegui reverter: ${failed.map((k) => VS_FIELDS[k]).join(", ")}`);
    result = parts.join(" · ") || "nada a reverter";
  }

  const punished = executorId && response.punish !== "none" ? await punish(guild, executorId, response.punish) : null;

  await sendModuleAlert(guild, cfg, v.alertChannelId, {
    system: "Visual do servidor",
    action: "Alteração detectada",
    author: executorId,
    color: response.revert ? 0xed4245 : 0xfaa61a,
    fields: [
      ...(executorId ? [] : [["Autor", "não identificado (falta permissão de auditoria?)"]]),
      ["Alterado", differing.map((k) => VS_FIELDS[k]).join(", ")],
      ["Resposta", response.label],
      ["Reversão", result],
      ...(punished ? [["Punição", punished]] : []),
    ],
  });
}

async function onGuildUpdate(oldGuild, newGuild) {
  return run(newGuild.id, () => handle(oldGuild, newGuild));
}

// Avisos de permissão que o painel mostra
function missingPermissions(guild) {
  const me = guild.members.me;
  const missing = [];
  if (!me?.permissions.has(PermissionFlagsBits.ManageGuild)) missing.push("Gerenciar servidor (para reverter)");
  if (!me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) missing.push("Ver registro de auditoria (para saber quem alterou)");
  return missing;
}

module.exports = { onGuildUpdate, takeSnapshot, restore, missingPermissions, IMAGES };
