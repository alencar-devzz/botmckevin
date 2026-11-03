const PostConfig = require("../../database/models/PostConfig");

const KEYS = ["like", "comment", "view", "delete"];
const STYLES = ["secondary", "primary", "success", "danger"];
const POSITIONS = ["top", "bottom"];

const DEFAULT_BUTTONS = {
  like: { emoji: null, style: "secondary", position: "bottom" },
  comment: { emoji: null, style: "secondary", position: "bottom" },
  view: { emoji: null, style: "secondary", position: "top" }, // canto direito, em cima da embed
  delete: { emoji: null, style: "secondary", position: "bottom" },
};
const DEFAULT_ORDER = ["like", "comment", "view", "delete"];

// Cache em memória: o evento de mensagens consulta isso a cada mensagem do servidor
const cache = new Map();

function sanitizeOrder(order) {
  const seen = [];
  for (const key of Array.isArray(order) ? order : []) {
    if (KEYS.includes(key) && !seen.includes(key)) seen.push(key);
  }
  for (const key of DEFAULT_ORDER) if (!seen.includes(key)) seen.push(key);
  return seen;
}

function toConfig(doc) {
  const buttons = {};
  for (const key of KEYS) {
    const saved = doc?.buttons?.[key] ?? {};
    buttons[key] = {
      emoji: saved.emoji ?? DEFAULT_BUTTONS[key].emoji,
      style: STYLES.includes(saved.style) ? saved.style : DEFAULT_BUTTONS[key].style,
      position: POSITIONS.includes(saved.position) ? saved.position : DEFAULT_BUTTONS[key].position,
    };
  }

  // Só um botão cabe no topo (acessório da seção): se houver mais de um, o primeiro fica
  let topTaken = false;
  for (const key of KEYS) {
    if (buttons[key].position !== "top") continue;
    if (topTaken) buttons[key].position = "bottom";
    topTaken = true;
  }

  return {
    channelId: doc?.channelId ?? null,
    enabled: doc?.enabled ?? true,
    buttons,
    order: sanitizeOrder(doc?.order),
    rowPosition: doc?.rowPosition === "above" ? "above" : "below",
  };
}

async function getPostConfig(guildId) {
  if (cache.has(guildId)) return cache.get(guildId);
  const doc = await PostConfig.findOne({ guildId }).lean();
  const cfg = toConfig(doc);
  cache.set(guildId, cfg);
  return cfg;
}

// patch aceita chaves com ponto (ex.: { "buttons.like.style": "success" })
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

// Volta campos ao padrão (ex.: ["buttons.like", "order"])
async function resetPostConfig(guildId, fields) {
  const unset = Object.fromEntries(fields.map((field) => [field, ""]));
  // Sem upsert/defaults: $unset em "buttons" conflitaria com os defaults inseridos
  const doc = await PostConfig.findOneAndUpdate({ guildId }, { $unset: unset }, { new: true }).lean();
  const cfg = toConfig(doc);
  cache.set(guildId, cfg);
  return cfg;
}

module.exports = {
  KEYS,
  STYLES,
  POSITIONS,
  DEFAULT_BUTTONS,
  DEFAULT_ORDER,
  getPostConfig,
  updatePostConfig,
  resetPostConfig,
};
