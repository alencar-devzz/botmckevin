const { AuditLogEvent, PermissionFlagsBits } = require("discord.js");

// Descobre, pelo registro de auditoria, se o bot foi desconectado de propósito por um membro.
// Sem a permissão "Ver registro de auditoria" não há como saber: o chamador trata como falha de conexão
// (o bot volta para a call).
const TIMINGS = {
  waits: [1_500, 2_500], // esperas antes de olhar o registro (ele demora um pouco para aparecer)
  recent: 15_000, // quão recente precisa ser uma desconexão que ainda não tínhamos visto
};

const counts = new Map(); // id da entrada -> quantidade de desconexões já vistas
let warned = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function warnOnce(reason) {
  if (warned) return;
  warned = true;
  console.warn(
    `[BOTCALL] Não consegui ler o registro de auditoria (${reason}). ` +
      "Dê a permissão 'Ver registro de auditoria' ao bot para detectar desconexões manuais."
  );
}

async function fetchEntries(guild) {
  if (!guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
    warnOnce("sem a permissão Ver registro de auditoria");
    return null;
  }
  try {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberDisconnect, limit: 10 });
    return [...logs.entries.values()];
  } catch (err) {
    warnOnce(err.message);
    return null;
  }
}

// Guarda a contagem atual para só reagir a desconexões NOVAS depois disso
async function snapshot(guild) {
  const entries = await fetchEntries(guild);
  for (const entry of entries ?? []) counts.set(entry.id, entry.extra?.count ?? 1);
}

// true se alguém (que não seja o próprio bot) desconectou membros de uma call agora há pouco
async function wasDisconnectedByMember(guild, botId) {
  for (const wait of TIMINGS.waits) {
    await sleep(wait);
    const entries = await fetchEntries(guild);
    if (entries === null) return false;

    for (const entry of entries) {
      if (entry.executorId === botId) continue;

      const count = entry.extra?.count ?? 1;
      const previous = counts.get(entry.id);
      counts.set(entry.id, count);

      const isNew =
        previous === undefined ? Date.now() - entry.createdTimestamp < TIMINGS.recent : count > previous;
      if (isNew) return true;
    }
  }
  return false;
}

module.exports = { TIMINGS, snapshot, wasDisconnectedByMember };
