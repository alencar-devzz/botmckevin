const { AuditLogEvent, PermissionFlagsBits, UserFlags } = require("discord.js");
const { getAntiRaidConfig } = require("./store");
const { sendModuleAlert, code } = require("./alert");
const { punish } = require("./engine");
const { AB_MODES, PUNISHMENTS } = require("./defaults");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Quem adicionou o bot, lido no registro de auditoria
async function findInviterId(guild, botId) {
  if (!guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) return null;
  await sleep(700);
  const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 6 }).catch(() => null);
  const entry = logs?.entries.find((e) => e.targetId === botId && Date.now() - e.createdTimestamp < 15_000);
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

async function onBotJoin(member) {
  if (!member.user.bot) return;
  const { guild } = member;
  if (member.id === guild.client.user.id) return;

  const cfg = await getAntiRaidConfig(guild.id);
  const ab = cfg.antiBot;
  if (ab.mode === "off") return;

  if (ab.allowedBots.includes(member.id)) return;
  if (ab.mode === "unverified" && member.user.flags?.has(UserFlags.VerifiedBot)) return;

  const inviterId = await findInviterId(guild, member.id);
  if (await isTrusted(guild, ab, inviterId)) return;

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
    color: 0xff0000,
    fields: [
      ["Modo", AB_MODES[ab.mode].label],
      ["Adicionado por", inviterId ? `<@${inviterId}> — ${code(inviterId)}` : "não identificado (falta permissão de auditoria?)"],
      ["Resultado", blocked ? (ab.action === "ban" ? "bot banido" : "bot expulso") : "não consegui remover o bot (cargo dele acima do meu?)"],
      ...(inviterResult ? [[`Punição de quem adicionou (${PUNISHMENTS[ab.inviterAction].label})`, inviterResult]] : []),
    ],
  });
}

module.exports = { onBotJoin };
