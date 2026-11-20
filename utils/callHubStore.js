const CallHubConfig = require("../database/models/CallHubConfig");
const {
  DEFAULT_TEXTS,
  TEXT_KEYS,
  BUTTON_KEYS,
  DEFAULT_STYLES,
  STYLE_LABELS,
} = require("./callHubDefaults");
const { MESSAGE_KEYS, DEFAULT_MESSAGES } = require("./callHubMessages");

const TTL = 60_000;
const cache = new Map(); // guildId -> { cfg, at }

const int = (value, min, max, fallback) => {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

const ids = (list) => [...new Set((Array.isArray(list) ? list : []).map(String))];

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
    ignoredChannels: ids(doc?.ignoredChannels),
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
    autoPanel: doc?.autoPanel ?? false,
    autoPanelClean: doc?.autoPanelClean ?? true,
    resetOnEmpty: doc?.resetOnEmpty ?? false,
    logChannelId: doc?.logChannelId || null,
    cooldown: int(doc?.actionCooldown, 0, 300, 0),
    emptyDelay: int(doc?.emptyDelay, 0, 3600, 0),
    pickerMax: int(doc?.pickerMax, 1, 25, 5),
    protectAdmins: doc?.protectAdmins ?? true,
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
