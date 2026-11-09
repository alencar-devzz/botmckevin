const { PermissionFlagsBits } = require("discord.js");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Procura no registro de auditoria uma entrada recente. O evento chega antes dela, então espera um pouco.
async function findAuditEntry(guild, type, match, maxAgeMs = 10_000) {
  if (!guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) return null;
  await sleep(700);
  const logs = await guild.fetchAuditLogs({ type, limit: 8 }).catch(() => null);
  return logs?.entries.find((e) => Date.now() - e.createdTimestamp < maxAgeMs && match(e)) ?? null;
}

// O dono e o próprio bot são sempre autorizados; o resto vem da lista de pessoas e cargos
async function isAuthorized(guild, executorId, { users = [], roles = [] }) {
  if (executorId === guild.client.user.id || executorId === guild.ownerId) return true;
  if (users.includes(executorId)) return true;
  if (!roles.length) return false;
  const member = await guild.members.fetch(executorId).catch(() => null);
  return !!member?.roles.cache.hasAny(...roles);
}

module.exports = { findAuditEntry, isAuthorized };
