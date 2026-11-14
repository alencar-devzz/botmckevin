const { PermissionFlagsBits } = require("discord.js");
const SpotifyConfig = require("../../database/models/SpotifyConfig");

const TTL = 60_000;
const cache = new Map(); // guildId -> { cfg, at }

const DEFAULT_LABELS = {
  linkLabel: "Abrir no Spotify",
  infoLabel: "Informações e letra",
  refreshLabel: "Atualizar",
};

// Textos do painel de informações (botão "Informações e letra")
const DEFAULT_INFO_LABELS = {
  infoArtistLabel: "Artista(s)",
  infoAlbumLabel: "Álbum",
  infoDurationLabel: "Duração",
  infoListeningLabel: "Ouvindo",
  lyricsTitle: "Letra",
};

// ---------- Validação dos campos editáveis ----------

// "#abc", "abc", "#aabbcc" -> "#aabbcc". Vazio -> "". Inválido -> null.
function normalizeHex(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  const match = value.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;
  let hex = match[1].toLowerCase();
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join("");
  return `#${hex}`;
}

// Ícone da pílula: "" = padrão | "-" = sem ícone | ID de emoji do Discord (ou <:nome:id>) | link https de imagem.
// Retorna a string a guardar ou null se for inválido.
function normalizeIcon(raw) {
  const value = String(raw ?? "").trim();
  if (!value || value === "-") return value;
  const custom = value.match(/^<a?:\w+:(\d{17,20})>$/) ?? value.match(/^(\d{17,20})$/);
  if (custom) return custom[1];
  if (/^https:\/\/\S+$/i.test(value) && value.length <= 300) return value;
  return null;
}

// Emoji de botão: unicode ou <:nome:id> / <a:nome:id>. "" = sem emoji. Inválido -> null.
function normalizeEmoji(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  if (/^<a?:\w{2,32}:\d{17,20}>$/.test(value)) return value;
  if (value.length <= 16 && /\p{Extended_Pictographic}/u.test(value)) return value;
  return null;
}

// Converte o emoji guardado para o formato do ButtonBuilder
function buttonEmoji(value) {
  if (!value) return null;
  const custom = value.match(/^<(a?):(\w+):(\d{17,20})>$/);
  return custom ? { animated: custom[1] === "a", name: custom[2], id: custom[3] } : value;
}

const ids = (list) => [...new Set((Array.isArray(list) ? list : []).map(String))];
const int = (value, fallback, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : fallback;
};
const label = (value, fallback, max = 80) => {
  const clean = typeof value === "string" ? value.trim().slice(0, max) : "";
  return clean || fallback;
};
const hex = (value) => normalizeHex(value) || "";
const oneOf = (value, list, fallback) => (list.includes(value) ? value : fallback);
const short = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");

function toConfig(doc) {
  return {
    enabled: doc?.enabled ?? true,
    allowedChannels: ids(doc?.allowedChannels),
    access: doc?.access === "roles" ? "roles" : "everyone",
    roles: ids(doc?.roles),
    allowOthers: doc?.allowOthers ?? true,
    cooldown: int(doc?.cooldown, 0, 0, 3600),

    barColor: oneOf(doc?.barColor, ["green", "cover", "custom"], "green"),
    barHex: hex(doc?.barHex),
    trackHex: hex(doc?.trackHex),
    knobHex: hex(doc?.knobHex),
    titleHex: hex(doc?.titleHex),
    artistHex: hex(doc?.artistHex),
    timeHex: hex(doc?.timeHex),
    pillTextHex: hex(doc?.pillTextHex),
    footerTextHex: hex(doc?.footerTextHex),
    bgHex: hex(doc?.bgHex),
    bgHex2: hex(doc?.bgHex2),
    shadeHex: hex(doc?.shadeHex),
    glassHex: hex(doc?.glassHex),
    containerHex: hex(doc?.containerHex),

    radius: int(doc?.radius, 34, 0, 60),
    blur: int(doc?.blur, 22, 0, 40),
    barHeight: int(doc?.barHeight, 7, 3, 16),
    overlay: doc?.overlay == null ? null : int(doc.overlay, 22, 0, 90),
    showTimes: doc?.showTimes ?? true,
    showKnob: doc?.showKnob ?? true,

    pillText: short(doc?.pillText, 20),
    pillIcon: normalizeIcon(doc?.pillIcon) ?? "",
    footerText: short(doc?.footerText, 30),
    footerName: oneOf(doc?.footerName, ["username", "display", "none"], "username"),
    showAvatar: doc?.showAvatar ?? true,

    showNowPlaying: doc?.showNowPlaying ?? true,
    showPill: doc?.showPill ?? true,
    glass: ["dark", "normal", "light"].includes(doc?.glass) ? doc.glass : "normal",

    showInfoButton: doc?.showInfoButton ?? true,
    showRefreshButton: doc?.showRefreshButton ?? true,
    lyricsSource: ["lrclib", "vagalume", "off"].includes(doc?.lyricsSource) ? doc.lyricsSource : "lrclib",
    linkLabel: label(doc?.linkLabel, DEFAULT_LABELS.linkLabel),
    infoLabel: label(doc?.infoLabel, DEFAULT_LABELS.infoLabel),
    refreshLabel: label(doc?.refreshLabel, DEFAULT_LABELS.refreshLabel),
    linkEmoji: normalizeEmoji(doc?.linkEmoji) ?? "",
    infoEmoji: normalizeEmoji(doc?.infoEmoji) ?? "",
    refreshEmoji: normalizeEmoji(doc?.refreshEmoji) ?? "",
    infoStyle: oneOf(doc?.infoStyle, ["secondary", "primary", "success", "danger"], "secondary"),
    refreshStyle: oneOf(doc?.refreshStyle, ["secondary", "primary", "success", "danger"], "secondary"),

    infoArtistLabel: label(doc?.infoArtistLabel, DEFAULT_INFO_LABELS.infoArtistLabel, 30),
    infoAlbumLabel: label(doc?.infoAlbumLabel, DEFAULT_INFO_LABELS.infoAlbumLabel, 30),
    infoDurationLabel: label(doc?.infoDurationLabel, DEFAULT_INFO_LABELS.infoDurationLabel, 30),
    infoListeningLabel: label(doc?.infoListeningLabel, DEFAULT_INFO_LABELS.infoListeningLabel, 30),
    lyricsTitle: label(doc?.lyricsTitle, DEFAULT_INFO_LABELS.lyricsTitle, 30),

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
  DEFAULT_INFO_LABELS,
  normalizeHex,
  normalizeIcon,
  normalizeEmoji,
  buttonEmoji,
  getSpotifyConfig,
  updateSpotifyConfig,
  resetSpotifyConfig,
  canUseSpotify,
  cooldownLeft,
  startCooldown,
};
