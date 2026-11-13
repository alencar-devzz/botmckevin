const { waitForEntry } = require("./auditHub");

// Procura no registro de auditoria uma entrada recente. Usa o hub (entradas em tempo real) e só
// consulta a API se a entrada não chegar a tempo. Mantém a assinatura antiga.
function findAuditEntry(guild, type, match, maxAgeMs = 10_000) {
  return waitForEntry(guild, type, match, { maxAgeMs });
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
