const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Procura no registro de auditoria quem fez a ação. Retorna null se não achar (ou sem permissão).
async function findAudit(guild, types, targetId, { match, maxAge = 15000, tries = 2, delay = 1000 } = {}) {
  const wanted = Array.isArray(types) ? types : [types];

  for (let attempt = 0; attempt < tries; attempt++) {
    await sleep(delay);
    try {
      const logs = await guild.fetchAuditLogs({
        type: wanted.length === 1 ? wanted[0] : undefined,
        limit: 10,
      });
      const entry = logs.entries.find(
        (e) =>
          wanted.includes(e.action) &&
          (!targetId || e.targetId === targetId) &&
          Date.now() - e.createdTimestamp <= maxAge &&
          (!match || match(e))
      );
      if (entry) return entry;
    } catch {
      return null; // sem permissão de ver o registro de auditoria
    }
  }
  return null;
}

const executorText = (entry) => (entry?.executor ? `<@${entry.executor.id}>` : "`Desconhecido`");

// "Manual" = pessoa; "Bot" = o próprio bot; vazio = não identificado
function originLabel(entry, client) {
  if (!entry?.executor) return "";
  return entry.executor.id === client.user.id ? " (Bot)" : " (Manual)";
}

module.exports = { findAudit, executorText, originLabel };
