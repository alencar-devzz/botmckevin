const { PermissionFlagsBits } = require("discord.js");
const SpotifyConfig = require("../../database/models/SpotifyConfig");

const TTL = 60_000;
const cache = new Map(); // guildId -> { cfg, at }

const DEFAULT_LABELS = {
  linkLabel: "Abrir no Spotify",
  infoLabel: "Informações e letra",
  refreshLabel: "Atualizar",
};

const ids = (list) => [...new Set((Array.isArray(list) ? list : []).map(String))];
const int = (value, fallback, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : fallback;
};
const label = (value, fallback) => {
  const clean = typeof value === "string" ? value.trim().slice(0, 80) : "";
  return clean || fallback;
};

function toConfig(doc) {
  return {
    enabled: doc?.enabled ?? true,
    allowedChannels: ids(doc?.allowedChannels),
    access: doc?.access === "roles" ? "roles" : "everyone",
    roles: ids(doc?.roles),
    allowOthers: doc?.allowOthers ?? true,
    cooldown: int(doc?.cooldown, 0, 0, 3600),

    barColor: doc?.barColor === "cover" ? "cover" : "green",
    showNowPlaying: doc?.showNowPlaying ?? true,
    showPill: doc?.showPill ?? true,
    glass: ["dark", "normal", "light"].includes(doc?.glass) ? doc.glass : "normal",

    showInfoButton: doc?.showInfoButton ?? true,
    showRefreshButton: doc?.showRefreshButton ?? true,
    lyricsSource: ["lrclib", "vagalume", "off"].includes(doc?.lyricsSource) ? doc.lyricsSource : "lrclib",
    linkLabel: label(doc?.linkLabel, DEFAULT_LABELS.linkLabel),
    infoLabel: label(doc?.infoLabel, DEFAULT_LABELS.infoLabel),
    refreshLabel: label(doc?.refreshLabel, DEFAULT_LABELS.refreshLabel),

    autoDeleteMinutes: int(doc?.autoDeleteMinutes, 0, 0, 1440),
    notListeningMessage: typeof doc?.notListeningMessage === "string" ? doc.notListeningMessage.slice(0, 300) : "",
  };
}

async function getSpotifyConfig(guildId) {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < TTL) return hit.cfg;
  const doc = await SpotifyConfig.findOne({ guildId }).lean();
  const cfg = toConfig(doc);
  cache.set(guildId, { cfg, at: Date.now() });
  return cfg;
}

async function updateSpotifyConfig(guildId, patch) {
  const doc = await SpotifyConfig.findOneAndUpdate(
    { guildId },
    { $set: patch },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  const cfg = toConfig(doc);
  cache.set(guildId, { cfg, at: Date.now() });
  return cfg;
}

// Apaga o documento: tudo volta ao padrão
async function resetSpotifyConfig(guildId) {
  await SpotifyConfig.deleteOne({ guildId });
  const cfg = toConfig(null);
  cache.set(guildId, { cfg, at: Date.now() });
  return cfg;
}

const isAdmin = (member) =>
  member.guild.ownerId === member.id || member.permissions.has(PermissionFlagsBits.Administrator);

// Pode usar o comando aqui e com estes cargos? Retorna { ok, reason, admin }
// reason: "disabled" | "channel" | "role" | "others"
// Os canais valem para todos; administradores e o dono ignoram cargos, "outras pessoas" e espera.
function canUseSpotify(cfg, member, channel, { self }) {
  if (!cfg.enabled) return { ok: false, reason: "disabled" };

  const channelIds = [channel.id, channel.parentId].filter(Boolean); // tópicos herdam o canal-pai
  if (cfg.allowedChannels.length && !channelIds.some((id) => cfg.allowedChannels.includes(id))) {
    return { ok: false, reason: "channel" };
  }

  if (isAdmin(member)) return { ok: true, admin: true };

  if (cfg.access === "roles" && !(cfg.roles.length && member.roles.cache.hasAny(...cfg.roles))) {
    return { ok: false, reason: "role" };
  }
  if (!self && !cfg.allowOthers) return { ok: false, reason: "others" };
  return { ok: true };
}

// Espera entre usos (por servidor e pessoa), guardada em memória
const lastUse = new Map(); // "guildId:userId" -> timestamp
const cooldownLeft = (cfg, guildId, userId) =>
  cfg.cooldown ? Math.max(0, (lastUse.get(`${guildId}:${userId}`) ?? 0) + cfg.cooldown * 1000 - Date.now()) : 0;
const startCooldown = (guildId, userId) => {
  lastUse.set(`${guildId}:${userId}`, Date.now());
  if (lastUse.size > 2000) lastUse.delete(lastUse.keys().next().value);
};

module.exports = {
  DEFAULT_LABELS,
  getSpotifyConfig,
  updateSpotifyConfig,
  resetSpotifyConfig,
  canUseSpotify,
  cooldownLeft,
  startCooldown,
};
