const { AuditLogEvent, PermissionFlagsBits } = require("discord.js");
const { sendModuleAlert, code } = require("./alert");
const { getAntiRaidConfig } = require("./store");
const { CORE_ACTIONS, PUNISHMENTS } = require("./defaults");

// Núcleo do Anti-Raid: conta ações em massa feitas por uma mesma pessoa/bot e responde conforme o painel.
// As ações chegam em tempo real pelo hub do registro de auditoria (auditHub.js), já com o autor.

// Entrada do registro de auditoria -> ação do núcleo
const ENTRY_ACTION = {
  [AuditLogEvent.ChannelDelete]: "channelDelete",
  [AuditLogEvent.ChannelCreate]: "channelCreate",
  [AuditLogEvent.RoleDelete]: "roleDelete",
  [AuditLogEvent.RoleCreate]: "roleCreate",
  [AuditLogEvent.MemberBanAdd]: "ban",
  [AuditLogEvent.MemberKick]: "kick",
  [AuditLogEvent.WebhookCreate]: "webhookCreate",
  [AuditLogEvent.EmojiDelete]: "emojiDelete",
  [AuditLogEvent.StickerDelete]: "emojiDelete",
  [AuditLogEvent.ChannelOverwriteCreate]: "channelPerms",
  [AuditLogEvent.ChannelOverwriteUpdate]: "channelPerms",
  [AuditLogEvent.ChannelOverwriteDelete]: "channelPerms",
  [AuditLogEvent.InviteCreate]: "inviteCreate",
  [AuditLogEvent.MemberUpdate]: "timeout", // só quando a mudança é um timeout (conferido abaixo)
};

const hits = new Map(); // "guild:autor" -> [{ t, action }]
const lastAlert = new Map(); // "guild:autor" -> timestamp do último alerta
const lastPunish = new Map(); // "guild:autor" -> timestamp da última tentativa de punir
const ALERT_GAP_MS = 30_000; // o cooldown vale SÓ para o alerta: a punição é tentada de novo enquanto ele continuar
const PUNISH_GAP_MS = 5_000;
const MAX_TIMEOUT_MS = 28 * 86_400_000;

// Permissões que, se ainda sobrarem depois de tirar os cargos, mostram que a punição não resolveu
const DANGEROUS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
];

async function isExempt(guild, cfg, executorId) {
  if (executorId === guild.client.user.id || executorId === guild.ownerId) return true;
  if (cfg.core.exemptUsers.includes(executorId)) return true;
  if (!cfg.core.exemptRoles.length) return false;
  const member = await guild.members.fetch(executorId).catch(() => null);
  return !!member?.roles.cache.hasAny(...cfg.core.exemptRoles);
}

// Aplica a punição escolhida. Devolve { ok, text }: ok = o autor foi contido (ou não havia o que fazer)
async function punishDetailed(guild, executorId, punishment) {
  if (punishment === "none") return { ok: true, text: "Nenhuma punição configurada." };
  const reason = "Anti-Raid: ações em massa";
  const member = await guild.members.fetch(executorId).catch(() => null);

  if (!member) {
    if (punishment === "ban") {
      const ok = await guild.members.ban(executorId, { reason }).then(() => true).catch(() => false);
      return { ok, text: ok ? "Autor já tinha saído; banido." : "Autor já tinha saído e o banimento falhou." };
    }
    return { ok: true, text: "Autor já não está no servidor." };
  }

  if (punishment === "ban") {
    const ok = await member.ban({ reason }).then(() => true).catch(() => false);
    return { ok, text: ok ? "Autor banido." : "Não consegui banir (cargo dele acima do meu?)." };
  }

  // Bot com cargo gerenciado (da integração) não perde o cargo: o jeito de conter é expulsar o bot
  if (member.user.bot && punishment === "strip") {
    const ok = await member.kick(reason).then(() => true).catch(() => false);
    return {
      ok,
      text: ok
        ? "Autor é um bot (o cargo dele é da integração e não pode ser removido): bot expulso."
        : "Autor é um bot e não consegui expulsá-lo (cargo dele acima do meu?).",
    };
  }

  // strip e kick começam removendo os cargos
  const removable = member.roles.cache.filter((r) => r.id !== guild.id && !r.managed && r.editable);
  let stripped = false;
  if (removable.size) {
    stripped = await member.roles.remove(removable, reason).then(() => true).catch(() => false);
  }

  if (punishment === "kick") {
    const ok = await member.kick(reason).then(() => true).catch(() => false);
    return { ok, text: ok ? "Cargos removidos e autor expulso." : "Não consegui expulsar (cargo dele acima do meu?)." };
  }

  // strip: confere se o autor ainda tem poder. Se tiver (cargo que não consigo tirar), plano B: silenciar.
  const fresh = await guild.members.fetch({ user: executorId, force: true }).catch(() => member);
  const stillDangerous = DANGEROUS.some((p) => fresh.permissions.has(p));
  const base = stripped
    ? `${removable.size} cargo(s) removido(s).`
    : removable.size
      ? "Não consegui remover os cargos."
      : "Não havia cargos que eu pudesse remover.";

  if (!stillDangerous) return { ok: stripped || !removable.size, text: base };

  const muted = await fresh.timeout(MAX_TIMEOUT_MS, reason).then(() => true).catch(() => false);
  return {
    ok: muted,
    text: muted
      ? `${base} Ele ainda tinha poder por um cargo que não consigo tirar: silenciado por 28 dias.`
      : `${base} Ele continua com permissões e não consegui silenciá-lo (cargo dele acima do meu?).`,
  };
}

// Compatível com os outros módulos: devolve só o texto
async function punish(guild, executorId, punishment) {
  return (await punishDetailed(guild, executorId, punishment)).text;
}

// Chamado pelo hub para cada entrada do registro de auditoria
async function trackEntry(entry, guild) {
  const action = ENTRY_ACTION[entry.action];
  const executorId = entry.executorId;
  if (!action || !executorId) return;

  // MemberUpdate também registra apelidos: só conta quando alguém foi silenciado (timeout)
  if (action === "timeout") {
    const change = entry.changes?.find((c) => c.key === "communication_disabled_until");
    if (!change?.new) return;
  }

  const cfg = await getAntiRaidConfig(guild.id);
  const { core } = cfg;
  if (!core.enabled || !core.actions.includes(action)) return;
  if (await isExempt(guild, cfg, executorId)) return;

  const key = `${guild.id}:${executorId}`;
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((h) => now - h.t < core.windowSec * 1000);
  list.push({ t: now, action });
  hits.set(key, list);

  // Dois gatilhos: muitas ações do MESMO tipo, ou muitas ações de tipos DIFERENTES somadas
  // (2 canais + 2 cargos + 2 bans não passam mais despercebidos).
  const perAction = list.filter((h) => h.action === action).length;
  const totalLimit = Math.max(core.limit, core.totalLimit > 0 ? core.totalLimit : Math.ceil(core.limit * 1.5));
  const byType = perAction >= core.limit;
  if (!byType && list.length < totalLimit) return;

  const live = core.mode === "live";
  const canPunish = live && now - (lastPunish.get(key) ?? 0) >= PUNISH_GAP_MS;
  const canAlert = now - (lastAlert.get(key) ?? 0) >= ALERT_GAP_MS;
  if (!canPunish && !canAlert) return;

  let result = live ? "Punição já em andamento." : "Nada foi aplicado (modo teste).";
  if (canPunish) {
    lastPunish.set(key, now);
    const outcome = await punishDetailed(guild, executorId, core.punishment);
    result = outcome.text;
    // Contido: zera a contagem. Se a punição falhou, a contagem continua e a próxima ação tenta de novo.
    if (outcome.ok) hits.delete(key);
  } else if (!live) {
    hits.delete(key);
  }

  if (!canAlert) return;
  lastAlert.set(key, now);

  await sendModuleAlert(guild, cfg, null, {
    system: "Anti-Raid",
    action: live ? "Punição aplicada" : "Simulação (modo teste)",
    author: executorId,
    color: live ? 0xe50000 : 0xfaa61a,
    fields: [
      ["Ação", byType ? CORE_ACTIONS[action] : `${CORE_ACTIONS[action]} (somada a outras ações)`],
      [
        "Gatilho",
        `${code(`${list.length} ações em ${core.windowSec}s`)} (limite ${core.limit} por tipo, ${totalLimit} no total)`,
      ],
      ["Punição configurada", PUNISHMENTS[core.punishment].label],
      ["Resultado", result],
    ],
  });
}

// Limpa os registros antigos para não crescerem sem fim
const cleaner = setInterval(() => {
  const now = Date.now();
  for (const [key, list] of hits) {
    if (!list.length || now - list.at(-1).t > 5 * 60_000) hits.delete(key);
  }
  for (const map of [lastAlert, lastPunish]) {
    for (const [key, at] of map) if (now - at > 10 * 60_000) map.delete(key);
  }
}, 5 * 60_000);
cleaner.unref?.();

module.exports = { trackEntry, punish, punishDetailed, ENTRY_ACTION };
