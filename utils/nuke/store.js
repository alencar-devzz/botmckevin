const { PermissionFlagsBits } = require("discord.js");
const NukeConfig = require("../../database/models/NukeConfig");
const { ALL_STAFF_ROLE_IDS } = require("../staffRoles");
const { DEFAULTS } = require("./defaults");

const TTL = 60_000;
const cache = new Map(); // guildId -> { cfg, at }

const ids = (list) => [...new Set((Array.isArray(list) ? list : []).map(String))];
const int = (value, fallback, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : fallback;
};
// Campo ausente = padrão; campo salvo como "" = a pessoa limpou de propósito
const str = (value, fallback) => (typeof value === "string" ? value : fallback);

function toConfig(doc) {
  return {
    enabled: doc?.enabled ?? true,
    access: ["staff", "roles", "admin"].includes(doc?.access) ? doc.access : "staff",
    roles: ids(doc?.roles),
    blockedRoles: ids(doc?.blockedRoles),
    users: ids(doc?.users),
    allowedChannels: ids(doc?.allowedChannels),
    protectedChannels: ids(doc?.protectedChannels),
    cooldown: int(doc?.cooldown, 10, 0, 3600),
    autoDeleteSeconds: int(doc?.autoDeleteSeconds, 0, 0, 3600),
    sendLog: doc?.sendLog ?? true,
    migrate: doc?.migrate ?? true,
    pin: doc?.pin ?? false,
    pingExecutor: doc?.pingExecutor ?? false,

    mode: ["container", "embed", "text"].includes(doc?.mode) ? doc.mode : DEFAULTS.mode,
    containerText: str(doc?.containerText, DEFAULTS.containerText),
    text: str(doc?.text, DEFAULTS.text),
    embedTitle: str(doc?.embedTitle, DEFAULTS.embedTitle),
    embedDescription: str(doc?.embedDescription, DEFAULTS.embedDescription),
    embedFooter: str(doc?.embedFooter, DEFAULTS.embedFooter),
    embedTimestamp: doc?.embedTimestamp ?? false,
    color: str(doc?.color, DEFAULTS.color),
    thumbnail: str(doc?.thumbnail, DEFAULTS.thumbnail) || "none",
    image: str(doc?.image, DEFAULTS.image),
  };
}

async function getNukeConfig(guildId) {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < TTL) return hit.cfg;
  const doc = await NukeConfig.findOne({ guildId }).lean();
  const cfg = toConfig(doc);
  cache.set(guildId, { cfg, at: Date.now() });
  return cfg;
}

async function updateNukeConfig(guildId, patch) {
  const doc = await NukeConfig.findOneAndUpdate(
    { guildId },
    { $set: patch },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  const cfg = toConfig(doc);
  cache.set(guildId, { cfg, at: Date.now() });
  return cfg;
}

// Volta só a mensagem (texto, cor, miniatura, imagem e modo) ao padrão
const MESSAGE_FIELDS = [
  "mode",
  "containerText",
  "text",
  "embedTitle",
  "embedDescription",
  "embedFooter",
  "embedTimestamp",
  "color",
  "thumbnail",
  "image",
];

async function resetNukeMessage(guildId) {
  const doc = await NukeConfig.findOneAndUpdate(
    { guildId },
    { $unset: Object.fromEntries(MESSAGE_FIELDS.map((key) => [key, ""])) },
    { new: true }
  ).lean();
  const cfg = toConfig(doc);
  cache.set(guildId, { cfg, at: Date.now() });
  return cfg;
}

// Apaga o documento: tudo volta ao padrão
async function resetNukeConfig(guildId) {
  await NukeConfig.deleteOne({ guildId });
  const cfg = toConfig(null);
  cache.set(guildId, { cfg, at: Date.now() });
  return cfg;
}

// Pode usar o comando neste canal / com estes cargos? Retorna { ok, reason, admin? }
//   reason: "protected" | "channel" | "role"
function canUseNuke(cfg, member, channel) {
  if (cfg.protectedChannels.includes(channel.id)) return { ok: false, reason: "protected" };
  if (cfg.allowedChannels.length && !cfg.allowedChannels.includes(channel.id)) {
    return { ok: false, reason: "channel" };
  }

  const isAdmin =
    member.guild.ownerId === member.id || member.permissions.has(PermissionFlagsBits.Administrator);
  if (isAdmin) return { ok: true, admin: true };

  if (cfg.blockedRoles.length && member.roles.cache.hasAny(...cfg.blockedRoles)) {
    return { ok: false, reason: "role" };
  }
  if (cfg.users.includes(member.id)) return { ok: true };

  if (cfg.access === "admin") return { ok: false, reason: "role" };
  if (cfg.access === "roles") {
    return cfg.roles.length && member.roles.cache.hasAny(...cfg.roles) ? { ok: true } : { ok: false, reason: "role" };
  }
  // staff: equipe + cargos extras
  const allowed = [...ALL_STAFF_ROLE_IDS, ...cfg.roles];
  return member.roles.cache.hasAny(...allowed) ? { ok: true } : { ok: false, reason: "role" };
}

module.exports = {
  getNukeConfig,
  updateNukeConfig,
  resetNukeMessage,
  resetNukeConfig,
  canUseNuke,
};
