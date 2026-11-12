const { AuditLogEvent, UserFlags } = require("discord.js");
const { waitForEntry } = require("./auditHub");
const { getAntiRaidConfig } = require("./store");
const { sendModuleAlert, code } = require("./alert");
const { punish } = require("./engine");
const { AB_MODES, PUNISHMENTS } = require("./defaults");

// Quem adicionou o bot: a entrada BotAdd chega em tempo real pelo hub (sem esperar nem buscar o registro inteiro)
async function findInviterId(guild, botId) {
  const entry = await waitForEntry(guild, AuditLogEvent.BotAdd, (e) => e.targetId === botId, {
    timeoutMs: 3000,
    maxAgeMs: 30_000,
  });
  return entry?.executorId ?? null;
}

async function isTrusted(guild, ab, inviterId) {
  if (!inviterId) return false;
  if (inviterId === guild.ownerId || inviterId === guild.client.user.id) return true;
  if (ab.trustedUsers.includes(inviterId)) return true;
  if (!ab.trustedRoles.length) return false;
  const member = await guild.members.fetch(inviterId).catch(() => null);
  return !!member?.roles.cache.hasAny(...ab.trustedRoles);
}

// Devolve true se o bot foi barrado (removido do servidor)
async function onBotJoin(member) {
  if (!member.user.bot) return false;
  const { guild } = member;
  if (member.id === guild.client.user.id) return false;

  const cfg = await getAntiRaidConfig(guild.id);
  const ab = cfg.antiBot;
  if (ab.mode === "off") return false;

  if (ab.allowedBots.includes(member.id)) return false;
  if (ab.mode === "unverified" && member.user.flags?.has(UserFlags.VerifiedBot)) return false;

  const inviterId = await findInviterId(guild, member.id);
  if (await isTrusted(guild, ab, inviterId)) return false;

  const reason = "Anti-Raid: bot não autorizado";
  const blocked = await (ab.action === "ban" ? member.ban({ reason }) : member.kick(reason))
    .then(() => true)
    .catch(() => false);

  const inviterResult = inviterId && ab.inviterAction !== "none" ? await punish(guild, inviterId, ab.inviterAction) : null;

  await sendModuleAlert(guild, cfg, ab.alertChannelId, {
    system: "Anti-bot",
    action: "Bot barrado",
    author: member.user,
    authorLabel: "Bot",
    color: 0xed4245,
    fields: [
      ["Modo", AB_MODES[ab.mode].label],
      ["Adicionado por", inviterId ? `<@${inviterId}> — ${code(inviterId)}` : "não identificado (falta permissão de auditoria?)"],
      ["Resultado", blocked ? (ab.action === "ban" ? "bot banido" : "bot expulso") : "não consegui remover o bot (cargo dele acima do meu?)"],
      ...(inviterResult ? [[`Punição de quem adicionou (${PUNISHMENTS[ab.inviterAction].label})`, inviterResult]] : []),
    ],
  });
  return blocked;
}

module.exports = { onBotJoin };
