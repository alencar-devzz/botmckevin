const { PermissionFlagsBits } = require("discord.js");
const RoleManageConfig = require("../database/models/RoleManageConfig");
const { DEFAULT_RULES, DEFAULT_TEXTS, TEXT_KEYS } = require("./roleManageDefaults");

// ======================= Configuração (com cache) =======================

const TTL = 60_000;
const cache = new Map(); // guildId -> { cfg, at }

const cleanIds = (list) => [...new Set((Array.isArray(list) ? list : []).map(String))];

function toConfig(doc) {
  const rules = Array.isArray(doc?.rules)
    ? doc.rules
        .filter((rule) => rule?.managerId)
        .map((rule) => ({ managerId: String(rule.managerId), blocked: cleanIds(rule.blocked) }))
    : DEFAULT_RULES.map((rule) => ({ managerId: rule.managerId, blocked: [...rule.blocked] }));

  const saved = doc?.texts ?? {};
  const texts = {};
  for (const key of TEXT_KEYS) {
    texts[key] = typeof saved[key] === "string" && saved[key].length ? saved[key] : DEFAULT_TEXTS[key];
  }

  return {
    enabled: doc?.enabled ?? true,
    rules,
    customRules: Array.isArray(doc?.rules),
    texts,
    color: Number.isInteger(doc?.color) ? doc.color : null,
    thumbnail: doc?.thumbnail || null,
    perPage: Math.min(5, Math.max(3, Number(doc?.perPage) || 4)),
  };
}

async function getRoleManageConfig(guildId) {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < TTL) return hit.cfg;
  const doc = await RoleManageConfig.findOne({ guildId }).lean();
  const cfg = toConfig(doc);
  cache.set(guildId, { cfg, at: Date.now() });
  return cfg;
}

// patch: caminhos do mongo, ex.: { "texts.title": "Cargos", color: 123, rules: [...] }
async function updateRoleManageConfig(guildId, patch) {
  const doc = await RoleManageConfig.findOneAndUpdate(
    { guildId },
    { $set: patch },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  const cfg = toConfig(doc);
  cache.set(guildId, { cfg, at: Date.now() });
  return cfg;
}

// paths: caminhos a apagar do documento (voltam ao padrão). Sem documento = já está no padrão.
async function resetRoleManageConfig(guildId, paths) {
  const unset = Object.fromEntries(paths.map((path) => [path, 1]));
  const doc = await RoleManageConfig.findOneAndUpdate({ guildId }, { $unset: unset }, { new: true }).lean();
  const cfg = toConfig(doc);
  cache.set(guildId, { cfg, at: Date.now() });
  return cfg;
}

// ======================= Permissões =======================

const isOwner = (member) => member.guild.ownerId === member.id;
const rulesOf = (cfg, member) => cfg.rules.filter((rule) => member.roles.cache.has(rule.managerId));

// Quem tem pelo menos uma regra (ou é o dono) pode abrir o painel
function isManager(cfg, member) {
  return isOwner(member) || rulesOf(cfg, member).length > 0;
}

// Pode gerenciar o cargo se QUALQUER cargo seu que tem regra não bloquear aquele cargo
function canManageRole(cfg, member, roleId) {
  if (isOwner(member)) return true;
  return rulesOf(cfg, member).some((rule) => !rule.blocked.includes(roleId));
}

// Quem pode editar as regras no menu: dono, Administrador ou cargo com acesso total (sem bloqueios)
function isConfigAdmin(cfg, member) {
  return (
    isOwner(member) ||
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    rulesOf(cfg, member).some((rule) => rule.blocked.length === 0)
  );
}

// ======================= Cargos =======================

// Cargos que podem aparecer: sem @everyone e sem cargos gerenciados por integração/booster
function listableRoles(guild) {
  return [...guild.roles.cache.values()]
    .filter((role) => role.id !== guild.id && !role.managed)
    .sort((a, b) => b.position - a.position);
}

// Cargos da lista conforme o filtro: "a" = os que a pessoa tem, "r" = os que ela tem e dá para remover,
// "d" = os que ela não tem (adicionáveis)
function collectRoles(guild, cfg, executor, target, filter) {
  if (!target) return [];
  const has = target.roles.cache;
  const all = listableRoles(guild);
  if (filter === "d") return all.filter((role) => !has.has(role.id));
  const owned = all.filter((role) => has.has(role.id));
  if (filter === "r") return owned.filter((role) => canManageRole(cfg, executor, role.id) && role.editable);
  return owned;
}

const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

// Busca por ID, menção ou nome (inteiro ou só um pedaço, sem diferenciar acento/maiúscula)
function searchRoles(guild, query) {
  const raw = String(query ?? "").trim();
  if (!raw) return [];

  const id = raw.match(/^<@&(\d+)>$/)?.[1] ?? (/^\d{17,20}$/.test(raw) ? raw : null);
  if (id) {
    const role = guild.roles.cache.get(id);
    return role && role.id !== guild.id && !role.managed ? [role] : [];
  }

  const q = normalize(raw.replace(/^@/, ""));
  if (!q) return [];

  const all = listableRoles(guild);
  const exact = all.filter((role) => normalize(role.name) === q);
  if (exact.length === 1) return exact;

  const starts = all.filter((role) => normalize(role.name).startsWith(q) && !exact.includes(role));
  const includes = all.filter(
    (role) => normalize(role.name).includes(q) && !exact.includes(role) && !starts.includes(role)
  );
  return [...exact, ...starts, ...includes];
}

// O cache de membros precisa estar completo para contar quem tem cada cargo
const lastTry = new Map();
const pending = new Map();
async function ensureMembers(guild) {
  if (guild.members.cache.size >= guild.memberCount) return;
  if (pending.has(guild.id)) return pending.get(guild.id);
  if (Date.now() - (lastTry.get(guild.id) ?? 0) < 60_000) return;
  lastTry.set(guild.id, Date.now());
  const job = guild.members
    .fetch({ time: 20_000 })
    .catch(() => {})
    .finally(() => pending.delete(guild.id));
  pending.set(guild.id, job);
  return job;
}

// ======================= Texto de permissões =======================

const PERMISSION_NAMES = {
  Administrator: "Administrador",
  ManageGuild: "Gerenciar servidor",
  ManageRoles: "Gerenciar cargos",
  ManageChannels: "Gerenciar canais",
  BanMembers: "Banir membros",
  KickMembers: "Expulsar membros",
  ModerateMembers: "Castigar membros",
  ManageMessages: "Gerenciar mensagens",
  MentionEveryone: "Mencionar @everyone",
  ManageNicknames: "Gerenciar apelidos",
  ManageWebhooks: "Gerenciar webhooks",
  ManageGuildExpressions: "Gerenciar expressões",
  ManageEmojisAndStickers: "Gerenciar emojis e figurinhas",
  ManageEvents: "Gerenciar eventos",
  ManageThreads: "Gerenciar tópicos",
  ViewAuditLog: "Ver registro de auditoria",
  MuteMembers: "Silenciar membros",
  DeafenMembers: "Ensurdecer membros",
  MoveMembers: "Mover membros",
  PrioritySpeaker: "Voz prioritária",
  CreateInstantInvite: "Criar convite",
  ViewChannel: "Ver canais",
  SendMessages: "Enviar mensagens",
  SendTTSMessages: "Enviar mensagens TTS",
  EmbedLinks: "Inserir links",
  AttachFiles: "Anexar arquivos",
  AddReactions: "Adicionar reações",
  ReadMessageHistory: "Ver histórico de mensagens",
  UseExternalEmojis: "Usar emojis externos",
  UseExternalStickers: "Usar figurinhas externas",
  UseApplicationCommands: "Usar comandos de aplicativos",
  Connect: "Conectar",
  Speak: "Falar",
  Stream: "Transmitir",
  UseVAD: "Usar detecção de voz",
  ChangeNickname: "Alterar apelido",
  CreatePublicThreads: "Criar tópicos públicos",
  CreatePrivateThreads: "Criar tópicos privados",
  SendMessagesInThreads: "Enviar mensagens em tópicos",
  SendVoiceMessages: "Enviar mensagens de voz",
  SendPolls: "Criar enquetes",
  PinMessages: "Fixar mensagens",
  ViewGuildInsights: "Ver insights do servidor",
  RequestToSpeak: "Pedir para falar",
  UseEmbeddedActivities: "Usar atividades",
  UseSoundboard: "Usar painel de sons",
  UseExternalSounds: "Usar sons externos",
  UseExternalApps: "Usar apps externos",
  CreateGuildExpressions: "Criar expressões",
  CreateEvents: "Criar eventos",
  BypassSlowmode: "Ignorar modo lento",
};

// As permissões mais "pesadas" aparecem primeiro
const PERMISSION_PRIORITY = [
  "ManageGuild",
  "ManageRoles",
  "ManageChannels",
  "BanMembers",
  "KickMembers",
  "ModerateMembers",
  "ManageMessages",
  "MentionEveryone",
  "ManageNicknames",
  "ManageWebhooks",
  "ViewAuditLog",
  "MuteMembers",
  "DeafenMembers",
  "MoveMembers",
];

function formatPermissions(role, limit = 4) {
  const perms = role.permissions;
  if (perms.has(PermissionFlagsBits.Administrator)) return "Administrador (todas as permissões)";

  const keys = perms.toArray();
  if (!keys.length) return "Nenhuma permissão";

  const rank = (key) => {
    const at = PERMISSION_PRIORITY.indexOf(key);
    return at === -1 ? PERMISSION_PRIORITY.length : at;
  };
  const sorted = [...keys].sort((a, b) => rank(a) - rank(b));
  const names = sorted.slice(0, limit).map((key) => PERMISSION_NAMES[key] ?? key);
  const rest = sorted.length - names.length;
  return rest > 0 ? `${names.join(", ")} e mais ${rest}` : names.join(", ");
}

// ======================= Estado dos botões (cabe no customId) =======================
// a = quem abriu o painel · m = modo (u = pessoa, r = cargo) · v = tela (l lista, d cargo, h membros, s resultados)
// t = pessoa em foco · r = cargo em foco · f = filtro (a, r, d) · p = página · x = membro extra (botão da lista de membros)

const toB36 = (id) => (id && id !== "0" ? BigInt(id).toString(36) : "0");
function fromB36(value) {
  if (!value || value === "0") return null;
  let n = 0n;
  for (const ch of value) {
    const digit = parseInt(ch, 36);
    if (Number.isNaN(digit)) throw new Error("estado inválido");
    n = n * 36n + BigInt(digit);
  }
  return n.toString();
}

function encodeState(s) {
  return [toB36(s.a), s.m, s.v, toB36(s.t), toB36(s.r), s.f ?? "a", String(s.p ?? 0), toB36(s.x)].join(".");
}

function decodeState(raw) {
  try {
    const parts = String(raw ?? "").split(".");
    if (parts.length !== 8) return null;
    const [a, m, v, t, r, f, p, x] = parts;
    if (!["u", "r"].includes(m) || !["l", "d", "h", "s"].includes(v)) return null;
    const owner = fromB36(a);
    if (!owner) return null;
    return {
      a: owner,
      m,
      v,
      t: fromB36(t),
      r: fromB36(r),
      f: ["a", "r", "d"].includes(f) ? f : "a",
      p: Math.max(0, parseInt(p, 10) || 0),
      x: fromB36(x),
    };
  } catch {
    return null;
  }
}

module.exports = {
  getRoleManageConfig,
  updateRoleManageConfig,
  resetRoleManageConfig,
  isOwner,
  isManager,
  isConfigAdmin,
  canManageRole,
  listableRoles,
  collectRoles,
  searchRoles,
  normalize,
  ensureMembers,
  formatPermissions,
  encodeState,
  decodeState,
};
