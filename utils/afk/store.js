const AfkStatus = require("../../database/models/AfkStatus");

// Cache em memória: "guildId:userId" -> { reason, since }.
// Carrega tudo do Mongo uma vez; depois as leituras de cada mensagem não tocam o banco.
let cache = null;
let loading = null;

const key = (guildId, userId) => `${guildId}:${userId}`;

async function ensureLoaded() {
  if (cache) return;
  if (!loading) {
    loading = AfkStatus.find({})
      .lean()
      .then((docs) => {
        cache = new Map(docs.map((d) => [key(d.guildId, d.userId), { reason: d.reason, since: d.since }]));
      })
      .catch((err) => {
        loading = null;
        throw err;
      });
  }
  await loading;
}

async function getAfk(guildId, userId) {
  await ensureLoaded();
  return cache.get(key(guildId, userId)) ?? null;
}

async function setAfk(guildId, userId, reason) {
  await ensureLoaded();
  const since = new Date();
  await AfkStatus.updateOne({ guildId, userId }, { $set: { reason, since } }, { upsert: true });
  cache.set(key(guildId, userId), { reason, since });
}

async function removeAfk(guildId, userId) {
  await ensureLoaded();
  await AfkStatus.deleteOne({ guildId, userId });
  cache.delete(key(guildId, userId));
}

module.exports = { getAfk, setAfk, removeAfk };
