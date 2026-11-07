const { PermissionFlagsBits } = require("discord.js");
const ClConfig = require("../../database/models/ClConfig");
const { ALL_STAFF_ROLE_IDS } = require("../staffRoles");

const TTL = 60_000;
const cache = new Map(); // guildId -> { cfg, at }

const ids = (list) => [...new Set((Array.isArray(list) ? list : []).map(String))];
const int = (value, fallback, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : fallback;
};

function toConfig(doc) {
  return {
    enabled: doc?.enabled ?? true,
    access: ["staff", "roles", "everyone"].includes(doc?.access) ? doc.access : "staff",
    roles: ids(doc?.roles),
    blockedRoles: ids(doc?.blockedRoles),
    cooldownExemptRoles: ids(doc?.cooldownExemptRoles),
    allowedChannels: ids(doc?.allowedChannels),
    blockedChannels: ids(doc?.blockedChannels),
    scope: doc?.scope === "guild" ? "guild" : "channel",
    amount: int(doc?.amount, 0, 0, 5000),
    scanLimit: int(doc?.scanLimit, 1000, 100, 5000),
    includeOld: doc?.includeOld ?? true,
    skipPinned: doc?.skipPinned ?? false,
    deleteTrigger: doc?.deleteTrigger ?? true,
    cooldown: int(doc?.cooldown, 0, 0, 3600),
    notice: doc?.notice ?? false,
    noticeSeconds: int(doc?.noticeSeconds, 5, 1, 60),
    sendLog: doc?.sendLog ?? true,
  };
}

async function getClConfig(guildId) {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < TTL) return hit.cfg;
  const doc = await ClConfig.findOne({ guildId }).lean();
  const cfg = toConfig(doc);
  cache.set(guildId, { cfg, at: Date.now() });
  return cfg;
}

async function updateClConfig(guildId, patch) {
  const doc = await ClConfig.findOneAndUpdate(
    { guildId },
    { $set: patch },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  const cfg = toConfig(doc);
  cache.set(guildId, { cfg, at: Date.now() });
  return cfg;
}

// Apaga o documento: tudo volta ao padrão
async function resetClConfig(guildId) {
  await ClConfig.deleteOne({ guildId });
  const cfg = toConfig(null);
  cache.set(guildId, { cfg, at: Date.now() });
  return cfg;
}

// Pode usar o comando neste canal / com estes cargos? Retorna { ok, reason }
function canUseCl(cfg, member, channel) {
  const channelIds = [channel.id, channel.parentId].filter(Boolean); // tópicos herdam o canal-pai
  if (channelIds.some((id) => cfg.blockedChannels.includes(id))) return { ok: false, reason: "channel" };
  if (cfg.allowedChannels.length && !channelIds.some((id) => cfg.allowedChannels.includes(id))) {
    return { ok: false, reason: "channel" };
  }

  const isAdmin =
    member.guild.ownerId === member.id || member.permissions.has(PermissionFlagsBits.Administrator);
  if (isAdmin) return { ok: true, admin: true };

  if (cfg.blockedRoles.length && member.roles.cache.hasAny(...cfg.blockedRoles)) {
    return { ok: false, reason: "role" };
  }

  if (cfg.access === "everyone") return { ok: true };
  if (cfg.access === "roles") {
    return cfg.roles.length && member.roles.cache.hasAny(...cfg.roles) ? { ok: true } : { ok: false, reason: "role" };
  }
  // staff: equipe + cargos extras
  const allowed = [...ALL_STAFF_ROLE_IDS, ...cfg.roles];
  return member.roles.cache.hasAny(...allowed) ? { ok: true } : { ok: false, reason: "role" };
}

module.exports = { getClConfig, updateClConfig, resetClConfig, canUseCl };
