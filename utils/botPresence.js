const { ActivityType } = require("discord.js");
const BotConfig = require("../database/models/BotConfig");

// Tipos de atividade (RPC) que um bot pode usar
const ACTIVITY_TYPES = {
  playing: {
    label: "Jogando",
    type: ActivityType.Playing,
    hint: "Aparece como Jogando + o texto que você definir.",
    textLabel: "Nome do jogo",
    textButton: "Definir jogo",
  },
  streaming: {
    label: "Transmitindo",
    type: ActivityType.Streaming,
    hint: "Aparece com a bolinha roxa. Precisa de um link do Twitch ou YouTube.",
    textLabel: "Título da transmissão",
    textButton: "Definir transmissão",
  },
  listening: {
    label: "Ouvindo",
    type: ActivityType.Listening,
    hint: "Aparece como Ouvindo + o texto que você definir.",
    textLabel: "O que está ouvindo",
    textButton: "Definir o que ouve",
  },
  watching: {
    label: "Assistindo",
    type: ActivityType.Watching,
    hint: "Aparece como Assistindo + o texto que você definir.",
    textLabel: "O que está assistindo",
    textButton: "Definir o que assiste",
  },
  competing: {
    label: "Competindo",
    type: ActivityType.Competing,
    hint: "Aparece como Competindo em + o texto que você definir.",
    textLabel: "Em que está competindo",
    textButton: "Definir competição",
  },
  custom: {
    label: "Personalizado",
    type: ActivityType.Custom,
    hint: "Mostra só o texto que você definir, sem prefixo.",
    textLabel: "Texto do status",
    textButton: "Definir texto",
  },
};

// Presença (bolinha ao lado do avatar)
const PRESENCE_STATUS = {
  online: { label: "Online", description: "Bolinha verde." },
  idle: { label: "Ausente", description: "Bolinha amarela." },
  dnd: { label: "Não perturbe", description: "Bolinha vermelha." },
  invisible: { label: "Invisível", description: "Aparece como offline." },
};

const STREAM_URL = /^https?:\/\/(www\.)?(twitch\.tv|youtube\.com|youtu\.be)\/\S+$/i;

async function getBotConfig() {
  let config = await BotConfig.findById("global").lean();
  if (!config) config = (await BotConfig.create({})).toObject();
  return config;
}

async function saveBotConfig(patch) {
  return BotConfig.findByIdAndUpdate(
    "global",
    { $set: patch },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
}

// O que ainda falta preencher para o status poder ser ativado
function missingFields(cfg) {
  const kind = cfg.presenceActivity;
  if (!kind || kind === "none") return [];
  const missing = [];
  if (kind === "custom") {
    if (!cfg.presenceState) missing.push("texto");
  } else {
    if (!cfg.presenceName) missing.push("texto");
    if (kind === "streaming" && !cfg.presenceUrl) missing.push("link");
  }
  return missing;
}

function buildActivities(cfg) {
  const kind = cfg.presenceActivity;
  if (!kind || kind === "none" || !ACTIVITY_TYPES[kind]) return [];
  if (missingFields(cfg).length) return null;

  const { type } = ACTIVITY_TYPES[kind];
  if (kind === "custom") return [{ name: "Custom Status", type, state: cfg.presenceState }];

  const activity = { name: cfg.presenceName, type };
  if (cfg.presenceState) activity.state = cfg.presenceState;
  if (kind === "streaming") activity.url = cfg.presenceUrl;
  return [activity];
}

// Aplica a configuração no bot. Se faltar algo, só troca a presença e mantém a atividade atual.
async function applyPresence(client, cfg) {
  const status = cfg.presenceStatus || "online";
  const activities = buildActivities(cfg);
  if (activities === null) return client.user.setPresence({ status });
  return client.user.setPresence({ status, activities });
}

// Texto do status que o bot está usando agora (lido do próprio bot)
function describePresence(client) {
  const activity = client.user.presence?.activities?.[0];
  if (!activity) return "Nenhum";
  if (activity.type === ActivityType.Custom) {
    return activity.state ? `Personalizado: ${activity.state}` : "Personalizado";
  }
  const entry = Object.values(ACTIVITY_TYPES).find((t) => t.type === activity.type);
  return `${entry?.label ?? "Atividade"} ${activity.name}`;
}

module.exports = {
  ACTIVITY_TYPES,
  PRESENCE_STATUS,
  STREAM_URL,
  getBotConfig,
  saveBotConfig,
  missingFields,
  buildActivities,
  applyPresence,
  describePresence,
};
