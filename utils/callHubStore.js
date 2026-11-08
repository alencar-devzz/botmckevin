const CallHubConfig = require("../database/models/CallHubConfig");
const {
  DEFAULT_NAME_TEMPLATE,
  DEFAULT_TEXTS,
  TEXT_KEYS,
  BUTTON_KEYS,
  DEFAULT_STYLES,
  STYLE_LABELS,
} = require("./callHubDefaults");
const { MESSAGE_KEYS, DEFAULT_MESSAGES } = require("./callHubMessages");

const TTL = 60_000;
const cache = new Map(); // guildId -> { cfg, at }

const ids = (list) => [...new Set((Array.isArray(list) ? list : []).map(String))];
const int = (value, fallback, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : fallback;
};

function toConfig(doc) {
  const saved = doc?.texts ?? {};
  const texts = {};
  for (const key of TEXT_KEYS) {
    texts[key] = typeof saved[key] === "string" && saved[key].length ? saved[key] : DEFAULT_TEXTS[key];
  }

  const styles = {};
  for (const key of BUTTON_KEYS) {
    const saved = doc?.styles?.[key];
    styles[key] = STYLE_LABELS[saved] ? saved : DEFAULT_STYLES[key];
  }

  const msgs = {};
  for (const key of MESSAGE_KEYS) {
    const saved = doc?.msgs?.[key];
    msgs[key] = typeof saved === "string" && saved.length ? saved : DEFAULT_MESSAGES[key];
  }

  return {
    enabled: doc?.enabled ?? true,
    triggerChannelId: doc?.triggerChannelId || null,
    categoryId: doc?.categoryId || null,
    nameTemplate: doc?.nameTemplate || DEFAULT_NAME_TEMPLATE,
    defaultLimit: int(doc?.defaultLimit, 0, 0, 99),
    defaultPrivate: doc?.defaultPrivate ?? false,
    deleteDelay: int(doc?.deleteDelay, 0, 0, 300),
    autoTransfer: doc?.autoTransfer ?? true,
    sendPanel: doc?.sendPanel ?? true,
    cooldown: int(doc?.cooldown, 0, 0, 3600),
    allowedRoles: ids(doc?.allowedRoles),
    blockedRoles: ids(doc?.blockedRoles),
    staffRoles: ids(doc?.staffRoles),
    texts,
    color: Number.isInteger(doc?.color) ? doc.color : null,
    thumbnail: doc?.thumbnail || null,
    styles,
    hidden: ids(doc?.hiddenButtons).filter((key) => BUTTON_KEYS.includes(key)),
    mode: doc?.panelMode === "select" ? "select" : "buttons",
    msgs,
    legend: doc?.panelLegend ?? true,
    dividers: doc?.panelDividers ?? true,
  };
}

async function getCallHubConfig(guildId) {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < TTL) return hit.cfg;
  const doc = await CallHubConfig.findOne({ guildId }).lean();
  const cfg = toConfig(doc);
  cache.set(guildId, { cfg, at: Date.now() });
  return cfg;
}

// patch: caminhos do mongo, ex.: { "texts.title": "Minha call", enabled: false }
async function updateCallHubConfig(guildId, patch) {
  const doc = await CallHubConfig.findOneAndUpdate(
    { guildId },
    { $set: patch },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  const cfg = toConfig(doc);
  cache.set(guildId, { cfg, at: Date.now() });
  return cfg;
}

// paths: caminhos a apagar do documento (voltam ao padrão)
async function resetCallHubConfig(guildId, paths) {
  const unset = Object.fromEntries(paths.map((path) => [path, 1]));
  const doc = await CallHubConfig.findOneAndUpdate({ guildId }, { $unset: unset }, { new: true }).lean();
  const cfg = toConfig(doc);
  cache.set(guildId, { cfg, at: Date.now() });
  return cfg;
}

// Apaga a configuração inteira do servidor
async function wipeCallHubConfig(guildId) {
  await CallHubConfig.deleteOne({ guildId });
  const cfg = toConfig(null);
  cache.set(guildId, { cfg, at: Date.now() });
  return cfg;
}

module.exports = { getCallHubConfig, updateCallHubConfig, resetCallHubConfig, wipeCallHubConfig };
