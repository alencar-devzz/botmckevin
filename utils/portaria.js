const { FIELDS, resolveSettings } = require("./portariaSettings");
const { buildPortariaPayload } = require("./portariaTemplate");

function scheduleDelete(message, seconds) {
  if (!seconds || seconds <= 0) return;
  setTimeout(() => message.delete().catch(() => {}), seconds * 1000);
}

// kind: "welcome" | "leave". Retorna a mensagem enviada ou null.
async function sendGreeting(kind, member, config, { force = false } = {}) {
  const f = FIELDS[kind];
  const enabled = config[f.enabled];
  const channelId = config[f.channel];
  if ((!enabled && !force) || !channelId) return null;

  const channel = member.guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return null;

  try {
    const payload = await buildPortariaPayload(kind, member, resolveSettings(kind, config));
    const sent = await channel.send(payload);
    scheduleDelete(sent, config[f.delay]);
    return sent;
  } catch (err) {
    console.error(`[PORTARIA] Erro ao enviar mensagem (${kind}):`, err.message);
    return null;
  }
}

// Retorna true se a DM foi entregue (DMs fechadas falham em silêncio)
async function sendWelcomeDm(member, config, { force = false } = {}) {
  if (!config.dmEnabled && !force) return false;
  try {
    const payload = await buildPortariaPayload("dm", member, resolveSettings("dm", config));
    await member.send(payload);
    return true;
  } catch {
    return false;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

function accountAgeDays(member) {
  return (Date.now() - member.user.createdTimestamp) / DAY_MS;
}

module.exports = { sendGreeting, sendWelcomeDm, accountAgeDays };
