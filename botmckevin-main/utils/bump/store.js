const BumpConfig = require("../../database/models/BumpConfig");
const BumpState = require("../../database/models/BumpState");
const {
  DISBOARD_ID,
  DEFAULT_SUCCESS_KEYWORDS,
  DEFAULT_COLOR,
  MESSAGE_DEFAULTS,
} = require("./defaults");

const TTL = 60_000;
const cache = new Map(); // guildId -> { cfg, at }

const ids = (list) => [...new Set((Array.isArray(list) ? list : []).map(String))];
const int = (value, fallback, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : fallback;
};
const str = (value, fallback) => (typeof value === "string" ? value : fallback);

function toMessage(doc, kind) {
  const d = MESSAGE_DEFAULTS[kind];
  return {
    mode: ["text", "embed", "container"].includes(doc?.mode) ? doc.mode : d.mode,
    text: str(doc?.text, d.text),
    containerText: str(doc?.containerText, d.containerText),
    containerColor: str(doc?.containerColor, d.containerColor),
    containerThumbnail: str(doc?.containerThumbnail, d.containerThumbnail),
    containerImage: str(doc?.containerImage, d.containerImage),
    embedTitle: str(doc?.embedTitle, d.embedTitle),
    embedUrl: str(doc?.embedUrl, d.embedUrl),
    embedDescription: str(doc?.embedDescription, d.embedDescription),
    embedColor: str(doc?.embedColor, DEFAULT_COLOR) || DEFAULT_COLOR,
    embedFooter: str(doc?.embedFooter, d.embedFooter),
    embedFooterIcon: str(doc?.embedFooterIcon, d.embedFooterIcon),
    embedAuthor: str(doc?.embedAuthor, d.embedAuthor),
    embedAuthorIcon: str(doc?.embedAuthorIcon, d.embedAuthorIcon),
    embedThumbnail: str(doc?.embedThumbnail, d.embedThumbnail),
    embedImage: str(doc?.embedImage, d.embedImage),
    thumbnailServer: doc?.thumbnailServer ?? false,
    embedTimestamp: doc?.embedTimestamp ?? d.embedTimestamp,
  };
}

function toConfig(doc) {
  const keywords = ids(doc?.successKeywords).map((k) => k.toLowerCase());
  return {
    enabled: doc?.enabled ?? false,
    channelId: doc?.channelId || "",
    bumpBotId: /^\d{15,25}$/.test(doc?.bumpBotId ?? "") ? doc.bumpBotId : DISBOARD_ID,
    commandName: (doc?.commandName || "bump").toLowerCase(),
    intervalMinutes: int(doc?.intervalMinutes, 120, 1, 10080),
    repeatMinutes: int(doc?.repeatMinutes, 0, 0, 1440),
    successKeywords: keywords.length ? keywords : DEFAULT_SUCCESS_KEYWORDS,
    customKeywords: keywords.length > 0,

    remind: doc?.remind ?? true,
    mentionLastBumper: doc?.mentionLastBumper ?? true,
    mentionRoles: ids(doc?.mentionRoles),
    deleteOldReminder: doc?.deleteOldReminder ?? false,

    thank: doc?.thank ?? true,
    thanksMention: doc?.thanksMention ?? false,

    reminder: toMessage(doc?.reminder, "reminder"),
    thanks: toMessage(doc?.thanks, "thanks"),
  };
}

async function getBumpConfig(guildId) {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < TTL) return hit.cfg;
  const doc = await BumpConfig.findOne({ guildId }).lean();
  const cfg = toConfig(doc);
  cache.set(guildId, { cfg, at: Date.now() });
  return cfg;
}

// patch aceita chaves com ponto (ex.: "reminder.mode").
async function updateBumpConfig(guildId, patch) {
  const doc = await BumpConfig.findOneAndUpdate(
    { guildId },
    { $set: patch },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  const cfg = toConfig(doc);
  cache.set(guildId, { cfg, at: Date.now() });
  return cfg;
}

// Volta UMA mensagem (reminder ou thanks) ao padrão
async function resetBumpMessage(guildId, kind) {
  await BumpConfig.updateOne({ guildId }, { $unset: { [kind]: "" } });
  const doc = await BumpConfig.findOne({ guildId }).lean();
  const cfg = toConfig(doc);
  cache.set(guildId, { cfg, at: Date.now() });
  return cfg;
}

// Apaga a configuração inteira (o estado de quem deu o último bump é mantido)
async function resetBumpConfig(guildId) {
  await BumpConfig.deleteOne({ guildId });
  const cfg = toConfig(null);
  cache.set(guildId, { cfg, at: Date.now() });
  return cfg;
}

const getBumpState = (guildId) => BumpState.findOne({ guildId }).lean();

module.exports = {
  getBumpConfig,
  updateBumpConfig,
  resetBumpMessage,
  resetBumpConfig,
  getBumpState,
};
