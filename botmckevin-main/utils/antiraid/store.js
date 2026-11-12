const AntiRaidConfig = require("../../database/models/AntiRaidConfig");
const { DEFAULTS } = require("./defaults");

const TTL = 60_000;
const cache = new Map(); // guildId -> { cfg, at }

const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);

// Mescla o que está salvo por cima dos padrões (objetos mesclados, listas substituídas)
function merge(base, over) {
  const out = { ...base };
  for (const key of Object.keys(over ?? {})) {
    if (over[key] === undefined) continue;
    out[key] = isObject(base[key]) && isObject(over[key]) ? merge(base[key], over[key]) : over[key];
  }
  return out;
}

const toConfig = (doc) => merge(structuredClone(DEFAULTS), doc?.cfg ?? {});

async function getAntiRaidConfig(guildId) {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < TTL) return hit.cfg;
  const doc = await AntiRaidConfig.findOne({ guildId }).lean();
  const cfg = toConfig(doc);
  cache.set(guildId, { cfg, at: Date.now() });
  return cfg;
}

// patch com caminhos relativos, ex.: { "core.limit": 5, "core.exemptRoles": [...] }
async function updateAntiRaidConfig(guildId, patch) {
  const $set = Object.fromEntries(Object.entries(patch).map(([path, value]) => [`cfg.${path}`, value]));
  const doc = await AntiRaidConfig.findOneAndUpdate(
    { guildId },
    { $set },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  const cfg = toConfig(doc);
  cache.set(guildId, { cfg, at: Date.now() });
  return cfg;
}

module.exports = { getAntiRaidConfig, updateAntiRaidConfig };
