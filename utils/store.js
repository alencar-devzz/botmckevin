const PostConfig = require("../../database/models/PostConfig");

// Cache em memória: o evento de mensagens consulta isso a cada mensagem do servidor
const cache = new Map();

function toConfig(doc) {
  return { channelId: doc?.channelId ?? null, enabled: doc?.enabled ?? true };
}

async function getPostConfig(guildId) {
  if (cache.has(guildId)) return cache.get(guildId);
  const doc = await PostConfig.findOne({ guildId }).lean();
  const cfg = toConfig(doc);
  cache.set(guildId, cfg);
  return cfg;
}

async function updatePostConfig(guildId, patch) {
  const doc = await PostConfig.findOneAndUpdate(
    { guildId },
    { $set: patch },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  const cfg = toConfig(doc);
  cache.set(guildId, cfg);
  return cfg;
}

module.exports = { getPostConfig, updatePostConfig };
