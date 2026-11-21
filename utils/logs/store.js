const LogConfig = require("../../database/models/LogConfig");
const { LOG_KEYS } = require("./categories");

const DEFAULT = { enabled: true, channelId: null, ignoreBots: true };
const TTL = 60_000;
const cache = new Map(); // guildId -> { data, at }

async function loadDoc(guildId) {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < TTL) return hit;

  const doc = await LogConfig.findOne({ guildId }).lean();
  const entry = { data: doc?.categories ?? {}, enabled: doc?.enabled !== false, at: Date.now() };
  cache.set(guildId, entry);
  return entry;
}

async function loadSettings(guildId) {
  return (await loadDoc(guildId)).data;
}

// Liga/desliga geral dos logs (botão Ativar/Desativar do painel Logs e registros)
async function isLogsEnabled(guildId) {
  return (await loadDoc(guildId)).enabled;
}

async function setLogsEnabled(guildId, enabled) {
  await LogConfig.findOneAndUpdate({ guildId }, { $set: { enabled: Boolean(enabled) } }, { upsert: true });
  cache.delete(guildId);
}

async function getCategory(guildId, key) {
  const data = await loadSettings(guildId);
  return { ...DEFAULT, ...(data[key] ?? {}) };
}

async function getAllCategories(guildId) {
  const data = await loadSettings(guildId);
  return Object.fromEntries(LOG_KEYS.map((key) => [key, { ...DEFAULT, ...(data[key] ?? {}) }]));
}

async function updateCategory(guildId, key, patch) {
  const $set = {};
  for (const [field, value] of Object.entries(patch)) $set[`categories.${key}.${field}`] = value;
  await LogConfig.findOneAndUpdate({ guildId }, { $set }, { upsert: true });
  cache.delete(guildId);
}

async function setAllChannels(guildId, channelId) {
  const $set = {};
  for (const key of LOG_KEYS) {
    $set[`categories.${key}.channelId`] = channelId;
    $set[`categories.${key}.enabled`] = true;
  }
  await LogConfig.findOneAndUpdate({ guildId }, { $set }, { upsert: true });
  cache.delete(guildId);
}

module.exports = { getCategory, getAllCategories, updateCategory, setAllChannels, isLogsEnabled, setLogsEnabled };
