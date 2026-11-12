const { GuildVerificationLevel, PermissionFlagsBits } = require("discord.js");
const { getAntiRaidConfig, updateAntiRaidConfig } = require("./store");
const { sendModuleAlert, code } = require("./alert");
const { MJ_SUSPECT_ACTIONS } = require("./defaults");

// Entrada em massa: percebe ondas de entradas, analisa a qualidade das contas
// e, havendo sinais suficientes, sobe a verificação do servidor por um tempo (lockdown).

const LEVEL = { high: GuildVerificationLevel.High, veryHigh: GuildVerificationLevel.VeryHigh };
const joins = new Map(); // guildId -> [{ id, at, createdAt, noAvatar, stem }]
const volumeCooldown = new Map(); // guildId -> timestamp do último alerta de volume
const timers = new Map(); // guildId -> timeout do fim do lockdown
const starting = new Set(); // guilds com um lockdown sendo iniciado (evita iniciar duas vezes)

const stemOf = (name) => String(name ?? "").toLowerCase().replace(/[^a-z]/g, "");

// Devolve os ids das contas que têm sinais suficientes
function findSuspects(entries, m) {
  if (!m.signals.length) return [];
  const stems = new Map();
  for (const e of entries) if (e.stem.length >= 3) stems.set(e.stem, (stems.get(e.stem) ?? 0) + 1);

  const need = Math.min(m.minSignals, m.signals.length);
  const limit = m.newAccountDays * 86_400_000;
  const now = Date.now();

  return entries
    .filter((e) => {
      let count = 0;
      if (m.signals.includes("newAccount") && now - e.createdAt < limit) count++;
      if (m.signals.includes("noAvatar") && e.noAvatar) count++;
      if (m.signals.includes("similarName") && (stems.get(e.stem) ?? 0) >= 3) count++;
      return count >= need;
    })
    .map((e) => e.id);
}

async function applySuspectAction(guild, ids, action) {
  if (action === "none" || !ids.length) return 0;
  let done = 0;
  for (const id of ids) {
    const member = await guild.members.fetch(id).catch(() => null);
    if (!member) continue;
    const ok =
      action === "kick"
        ? await member.kick("Anti-Raid: entrada em massa suspeita").then(() => true).catch(() => false)
        : await member.timeout(60 * 60 * 1000, "Anti-Raid: entrada em massa suspeita").then(() => true).catch(() => false);
    if (ok) done++;
  }
  return done;
}

function scheduleEnd(guild, until) {
  clearTimeout(timers.get(guild.id));
  const t = setTimeout(() => endLockdown(guild, "O tempo do lockdown acabou.").catch(() => {}), Math.max(1000, until - Date.now()));
  t.unref?.();
  timers.set(guild.id, t);
}

// Pausa convites e DMs do servidor (incident actions do Discord). Devolve true se conseguiu.
async function setIncidents(guild, until, m) {
  if (!m.pauseInvites && !m.pauseDms) return false;
  if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageGuild)) return false;
  return guild
    .setIncidentActions({
      invitesDisabledUntil: m.pauseInvites ? new Date(until) : null,
      dmsDisabledUntil: m.pauseDms ? new Date(until) : null,
    })
    .then(() => true)
    .catch(() => false);
}

async function startLockdown(guild, cfg, suspects, total, byVolume = false) {
  const m = cfg.massJoin;
  const target = LEVEL[m.lockdownLevel] ?? LEVEL.high;
  const prev = guild.verificationLevel;
  const needsRaise = prev < target;

  // Só diz "elevada" se o Discord aceitou de verdade (antes o erro era engolido e o alerta mentia)
  let raised = false;
  if (needsRaise) {
    raised = await guild
      .setVerificationLevel(target, "Anti-Raid: lockdown por entrada em massa")
      .then(() => true)
      .catch(() => false);
  }

  const until = Date.now() + m.lockdownMin * 60_000;
  const incidents = await setIncidents(guild, until, m);
  await updateAntiRaidConfig(guild.id, {
    "massJoin.lockdown": { until, prev: raised ? prev : null, level: target, incidents },
  });
  scheduleEnd(guild, until);

  const punished = await applySuspectAction(guild, suspects, m.suspectAction);
  const paused = [m.pauseInvites && "convites", m.pauseDms && "DMs"].filter(Boolean).join(" e ");
  await sendModuleAlert(guild, cfg, m.alertChannelId, {
    system: "Entrada em massa",
    action: "Lockdown ativado",
    color: 0xed4245,
    fields: [
      ["Entradas na janela", code(`${total} em ${m.windowSec}s`)],
      ["Contas suspeitas", code(suspects.length)],
      ...(byVolume && suspects.length < Math.max(2, Math.ceil(m.threshold / 2))
        ? [["Motivo", `volume muito acima do gatilho (${m.volumeFactor}x), mesmo sem contas suspeitas suficientes`]]
        : []),
      [
        "Verificação",
        raised
          ? "elevada"
          : needsRaise
            ? "não consegui elevar (falta Gerenciar servidor?)"
            : "já estava no nível pedido ou acima",
      ],
      ...(paused ? [["Convites e DMs", incidents ? `pausados (${paused})` : `não consegui pausar (${paused}); falta Gerenciar servidor?`]] : []),
      ["Fim previsto", `<t:${Math.floor(until / 1000)}:R>`],
      ["Suspeitos", `${MJ_SUSPECT_ACTIONS[m.suspectAction].label}${m.suspectAction !== "none" ? ` (${punished} afetado(s))` : ""}`],
    ],
  });
}

async function endLockdown(guild, reason = "Encerrado manualmente.") {
  clearTimeout(timers.get(guild.id));
  timers.delete(guild.id);
  const cfg = await getAntiRaidConfig(guild.id);
  const lock = cfg.massJoin.lockdown;
  if (!lock) return false;

  if (lock.prev != null && guild.verificationLevel === lock.level) {
    await guild.setVerificationLevel(lock.prev, "Anti-Raid: fim do lockdown").catch(() => {});
  }
  if (lock.incidents) {
    await guild.setIncidentActions({ invitesDisabledUntil: null, dmsDisabledUntil: null }).catch(() => {});
  }
  await updateAntiRaidConfig(guild.id, { "massJoin.lockdown": null });
  await sendModuleAlert(guild, cfg, cfg.massJoin.alertChannelId, {
    system: "Entrada em massa",
    action: "Lockdown encerrado",
    color: 0x3ba55d,
    fields: [["Motivo", reason], ["Verificação", lock.prev != null ? "voltou ao nível anterior" : "não precisou ser restaurada"]],
  });
  return true;
}

async function onMemberAdd(member) {
  if (member.user.bot) return; // bots ficam com o Anti-bot
  const { guild } = member;
  const cfg = await getAntiRaidConfig(guild.id);
  const m = cfg.massJoin;
  if (!m.enabled) return;

  const now = Date.now();
  const list = (joins.get(guild.id) ?? []).filter((e) => now - e.at < m.windowSec * 1000);
  list.push({
    id: member.id,
    at: now,
    createdAt: member.user.createdTimestamp,
    noAvatar: !member.user.avatar,
    stem: stemOf(member.user.username),
  });
  joins.set(guild.id, list);

  if (m.pausedUntil > now) return; // modo evento

  // Em lockdown: quem entra com sinais suspeitos recebe a resposta na hora
  if (m.lockdown && m.lockdown.until > now) {
    if (findSuspects(list, m).includes(member.id)) await applySuspectAction(guild, [member.id], m.suspectAction);
    return;
  }

  if (list.length < m.threshold) return;

  const suspects = findSuspects(list, m);
  const needed = Math.max(2, Math.ceil(m.threshold / 2));
  // Volume muito acima do gatilho já é raid, mesmo com contas "limpas" (velhas, com avatar, nomes variados)
  const byVolume = m.volumeLockdown && list.length >= m.threshold * (m.volumeFactor || 2);

  if (suspects.length >= needed || byVolume) {
    if (starting.has(guild.id)) return;
    starting.add(guild.id);
    try {
      return await startLockdown(guild, cfg, suspects, list.length, byVolume);
    } finally {
      starting.delete(guild.id);
    }
  }

  // O cooldown vale SÓ para o alerta de volume: o lockdown acima é reavaliado a cada entrada
  if (now - (volumeCooldown.get(guild.id) ?? 0) < 60_000) return;
  volumeCooldown.set(guild.id, now);

  await sendModuleAlert(guild, cfg, m.alertChannelId, {
    system: "Entrada em massa",
    action: "Volume alto de entradas",
    fields: [
      ["Entradas na janela", code(`${list.length} em ${m.windowSec}s`)],
      ["Contas suspeitas", `${code(suspects.length)} (precisa de ${needed} para o lockdown)`],
      m.volumeLockdown
        ? `O lockdown sai sozinho se chegar a ${m.threshold * (m.volumeFactor || 2)} entradas na janela ou se as contas suspeitas passarem do mínimo. Nada foi alterado.`
        : "Só o volume não aciona o lockdown. Nada foi alterado.",
    ],
  });
}

// Limpa as listas de entradas de servidores que ficaram quietos
const cleaner = setInterval(() => {
  const now = Date.now();
  for (const [guildId, list] of joins) if (!list.length || now - list.at(-1).at > 5 * 60_000) joins.delete(guildId);
  for (const [guildId, at] of volumeCooldown) if (now - at > 10 * 60_000) volumeCooldown.delete(guildId);
}, 5 * 60_000);
cleaner.unref?.();

// Ao ligar o bot: retoma lockdowns que estavam em andamento
async function resumeLockdowns(client) {
  for (const guild of client.guilds.cache.values()) {
    const cfg = await getAntiRaidConfig(guild.id);
    const lock = cfg.massJoin.lockdown;
    if (!lock) continue;
    if (lock.until <= Date.now()) await endLockdown(guild, "O tempo do lockdown acabou enquanto o bot estava fora.");
    else scheduleEnd(guild, lock.until);
  }
}

module.exports = { onMemberAdd, endLockdown, resumeLockdowns };
