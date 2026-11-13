const { PermissionFlagsBits } = require("discord.js");

// Hub do registro de auditoria. O Discord entrega cada entrada do registro em tempo real
// (evento guildAuditLogEntryCreate), já dizendo QUEM fez a ação. Isso substitui o antigo
// "espera 700 ms e busca as últimas 8 entradas", que perdia o autor quando muita coisa
// acontecia ao mesmo tempo e dava ao atacante mais de 1 segundo de vantagem.
//
//  - register(tipos, função): módulos que reagem a entradas (núcleo, permissões perigosas...)
//  - dispatch(entry, guild):  chamado pelo evento; guarda a entrada e avisa os módulos
//  - waitForEntry(...):       para módulos que dependem de OUTRO evento (ex.: guildUpdate, entrada de bot):
//                             acha a entrada no que já chegou, espera um pouco e só então consulta a API

const RECENT_MS = 60_000;
const MAX_PER_GUILD = 300;

const recent = new Map(); // guildId -> [{ entry, at }]
const handlers = []; // { types: Set, fn }

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const canViewAudit = (guild) => !!guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog);

function register(types, fn) {
  handlers.push({ types: new Set(types), fn });
}

function remember(guildId, entry) {
  const now = Date.now();
  const list = (recent.get(guildId) ?? []).filter((r) => now - r.at < RECENT_MS);
  list.push({ entry, at: now });
  if (list.length > MAX_PER_GUILD) list.splice(0, list.length - MAX_PER_GUILD);
  recent.set(guildId, list);
}

async function dispatch(entry, guild) {
  remember(guild.id, entry);
  const jobs = handlers.filter((h) => h.types.has(entry.action));
  const results = await Promise.allSettled(jobs.map((h) => h.fn(entry, guild)));
  for (const r of results) {
    if (r.status === "rejected") console.error("[ANTIRAID] Erro ao tratar uma entrada de auditoria:", r.reason);
  }
}

function findRecent(guildId, type, match, maxAgeMs) {
  const list = recent.get(guildId) ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    const { entry } = list[i];
    if (entry.action === type && Date.now() - entry.createdTimestamp < maxAgeMs && match(entry)) return entry;
  }
  return null;
}

// Procura uma entrada: primeiro nas que já chegaram, depois espera as próximas (100 em 100 ms)
// e, por último, consulta a API uma vez. Devolve null sem a permissão "Ver registro de auditoria".
async function waitForEntry(guild, type, match, { timeoutMs = 2500, maxAgeMs = 15_000 } = {}) {
  if (!canViewAudit(guild)) return null;

  const end = Date.now() + timeoutMs;
  for (;;) {
    const hit = findRecent(guild.id, type, match, maxAgeMs);
    if (hit) return hit;
    if (Date.now() >= end) break;
    await sleep(100);
  }

  const logs = await guild.fetchAuditLogs({ type, limit: 25 }).catch(() => null);
  return logs?.entries.find((e) => Date.now() - e.createdTimestamp < maxAgeMs && match(e)) ?? null;
}

const cleaner = setInterval(() => {
  const now = Date.now();
  for (const [guildId, list] of recent) {
    const fresh = list.filter((r) => now - r.at < RECENT_MS);
    if (fresh.length) recent.set(guildId, fresh);
    else recent.delete(guildId);
  }
}, 60_000);
cleaner.unref?.();

module.exports = { register, dispatch, waitForEntry, canViewAudit };
