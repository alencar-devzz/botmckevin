const { AuditLogEvent } = require("discord.js");
const { getAntiRaidConfig } = require("./store");
const { sendModuleAlert, code } = require("./alert");
const { isAuthorized } = require("./audit");
const { punish } = require("./engine");
const { MV_ACTIONS, PUNISHMENTS } = require("./defaults");

// Mov call: soma quantos membros uma pessoa moveu/desconectou de calls numa janela curta.
// Cada entrada de auditoria já traz a quantidade de membros afetados (extra.count).

const KIND = { [AuditLogEvent.MemberMove]: "move", [AuditLogEvent.MemberDisconnect]: "disconnect" };
const counts = new Map(); // "guild:autor" -> [{ t, n }]
const cooldown = new Map();

async function onAuditEntry(entry, guild) {
  const kind = KIND[entry.action];
  if (!kind || !entry.executorId) return;

  const cfg = await getAntiRaidConfig(guild.id);
  const m = cfg.movCall;
  if (!m.enabled || !m.actions.includes(kind)) return;
  if (await isAuthorized(guild, entry.executorId, { users: m.exemptUsers, roles: m.exemptRoles })) return;

  const key = `${guild.id}:${entry.executorId}`;
  const now = Date.now();
  const list = (counts.get(key) ?? []).filter((e) => now - e.t < m.windowSec * 1000);
  list.push({ t: now, n: Math.max(1, Number(entry.extra?.count) || 1) });
  counts.set(key, list);

  const total = list.reduce((sum, e) => sum + e.n, 0);
  if (total < m.limit) return;
  if (now - (cooldown.get(key) ?? 0) < 30_000) return;
  cooldown.set(key, now);
  counts.delete(key);

  const result = m.punishment !== "none" ? await punish(guild, entry.executorId, m.punishment) : null;

  await sendModuleAlert(guild, cfg, m.alertChannelId, {
    system: "Mov call",
    action: "Movimentação em massa",
    author: entry.executorId,
    color: result ? 0xed4245 : 0xfaa61a,
    fields: [
      ["Última ação", MV_ACTIONS[kind]],
      ["Total", `${code(`${total} membros em ${m.windowSec}s`)} (limite ${m.limit})`],
      [`Punição (${PUNISHMENTS[m.punishment].label})`, result ?? "nenhuma, só aviso"],
      "Mover e desconectar não podem ser desfeitos pelo bot.",
    ],
  });
}

module.exports = { onAuditEntry };
