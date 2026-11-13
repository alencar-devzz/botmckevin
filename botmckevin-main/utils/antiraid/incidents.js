const AntiRaidIncident = require("../../database/models/AntiRaidIncident");

// Histórico de incidentes do Anti-Raid. Quem grava é o alert.js (todo alerta passa por lá);
// a leitura é feita pelo painel "Histórico de incidentes".

const clip = (value, max) => String(value ?? "").slice(0, max);
const idOf = (x) => (x ? (typeof x === "object" ? x.id : String(x)) : null);

// Transforma os campos do alerta (formato novo ou antigo) em linhas de texto
function toLines(spec) {
  if (Array.isArray(spec.fields)) {
    return spec.fields.map((f) => (Array.isArray(f) ? `**${f[0]}:** ${f[1]}` : String(f)));
  }
  if (Array.isArray(spec.groups)) return spec.groups.flat().map(String);
  if (Array.isArray(spec.lines)) return spec.lines.map(String);
  return [];
}

// Nunca lança erro: um problema no Mongo não pode impedir o alerta de sair
async function recordIncident(guild, spec) {
  try {
    await AntiRaidIncident.create({
      guildId: guild.id,
      system: clip(spec.system ?? spec.title ?? "Anti-Raid", 80),
      action: clip(spec.action ?? "", 120),
      authorId: idOf(spec.author),
      channelId: idOf(spec.channel),
      fields: toLines(spec).slice(0, 12).map((line) => clip(line, 300)),
      content: spec.content !== undefined ? clip(spec.content, 500) : null,
    });
  } catch (err) {
    console.error("[ANTIRAID] Não consegui gravar o incidente:", err.message);
  }
}

async function getIncidentStats(guildId) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [last24h, last] = await Promise.all([
    AntiRaidIncident.countDocuments({ guildId, at: { $gte: since } }),
    AntiRaidIncident.findOne({ guildId }).sort({ at: -1 }).select("system action at").lean(),
  ]);
  return { last24h, last };
}

// Uma página do histórico, da mais recente para a mais antiga. system = null mostra todos.
async function listIncidents(guildId, { system = null, page = 1, size = 5 } = {}) {
  const query = { guildId };
  if (system) query.system = String(system);

  const total = await AntiRaidIncident.countDocuments(query);
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Number(page) || 1), pages);
  const items = await AntiRaidIncident.find(query)
    .sort({ at: -1 })
    .skip((current - 1) * size)
    .limit(size)
    .lean();

  return { items, total, pages, page: current };
}

async function listSystems(guildId) {
  const systems = await AntiRaidIncident.distinct("system", { guildId });
  return systems.filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR")).slice(0, 24);
}

module.exports = { recordIncident, getIncidentStats, listIncidents, listSystems };
