// Mensagens apagadas por comandos do próprio bot (ex: limpar) não geram um log cada.
// O comando registra os IDs aqui e envia um único log resumido no final.
const ids = new Map(); // messageId -> expira em (ms)
const TTL = 10 * 60_000;

function suppressMessage(id) {
  ids.set(id, Date.now() + TTL);
}

function isSuppressed(id) {
  const exp = ids.get(id);
  if (!exp) return false;
  if (exp < Date.now()) {
    ids.delete(id);
    return false;
  }
  return true;
}

function clearSuppressed(list) {
  // pequena margem: o evento messageDelete chega depois do delete()
  setTimeout(() => list.forEach((id) => ids.delete(id)), 15_000);
}

// Cargos dados/removidos pelo painel n!groles: o log genérico de cargos (guildMemberUpdate) ignora essas mudanças,
// porque o painel já envia o próprio log com o staff que realmente clicou (utils/logs/panelRoles.js).
const roleChanges = new Map(); // guildId:userId:roleId:tipo -> expira em (ms)
const ROLE_TTL = 30_000;
const roleKey = (guildId, userId, roleId, kind) => `${guildId}:${userId}:${roleId}:${kind}`;

function suppressRoleChange(guildId, userId, roleId, kind) {
  roleChanges.set(roleKey(guildId, userId, roleId, kind), Date.now() + ROLE_TTL);
}

function unsuppressRoleChange(guildId, userId, roleId, kind) {
  roleChanges.delete(roleKey(guildId, userId, roleId, kind));
}

// Retorna true (e consome a marca) se essa mudança veio do painel
function consumeRoleChange(guildId, userId, roleId, kind) {
  const key = roleKey(guildId, userId, roleId, kind);
  const exp = roleChanges.get(key);
  if (!exp) return false;
  roleChanges.delete(key);
  return exp >= Date.now();
}

// Kick e ban feitos pelos comandos do bot (/kick, /ban, n!kick, n!ban): só o log da própria ação
// (Expulsão ou Banimento) é enviado. Saída, cargos removidos e castigos desse membro ficam de fora.
const commandExits = new Map(); // guildId:userId -> { action, exp }
const EXIT_TTL = 60_000;
const exitKey = (guildId, userId) => `${guildId}:${userId}`;

function markCommandExit(guildId, userId, action) {
  commandExits.set(exitKey(guildId, userId), { action, exp: Date.now() + EXIT_TTL });
}

// Retorna "kick" | "ban" enquanto a marca estiver válida; senão null
function getCommandExit(guildId, userId) {
  const key = exitKey(guildId, userId);
  const entry = commandExits.get(key);
  if (!entry) return null;
  if (entry.exp < Date.now()) {
    commandExits.delete(key);
    return null;
  }
  return entry.action;
}

function clearCommandExit(guildId, userId) {
  commandExits.delete(exitKey(guildId, userId));
}

// Canais recriados pelo comando nnuke: os logs automáticos de "canal criado" e "canal excluído" ficam de fora,
// porque o próprio comando envia um único log (utils/nuke/engine.js).
const nukedChannels = new Map(); // channelId -> expira em (ms)
const nukeCreates = new Map(); // guildId:categoria:nome -> expira em (ms)
const NUKE_TTL = 30_000;
const createKey = (guildId, name, parentId) => `${guildId}:${parentId ?? ""}:${name}`;

function suppressChannelDelete(channelId) {
  nukedChannels.set(channelId, Date.now() + NUKE_TTL);
}

// Retorna true (e consome a marca) se esse canal foi apagado pelo nnuke
function consumeChannelDelete(channelId) {
  const exp = nukedChannels.get(channelId);
  if (!exp) return false;
  nukedChannels.delete(channelId);
  return exp >= Date.now();
}

// O ID do canal novo ainda não existe: a marca usa servidor + categoria + nome
function suppressChannelCreate(guildId, name, parentId) {
  nukeCreates.set(createKey(guildId, name, parentId), Date.now() + NUKE_TTL);
}

function consumeChannelCreate(channel) {
  const key = createKey(channel.guild?.id, channel.name, channel.parentId);
  const exp = nukeCreates.get(key);
  if (!exp) return false;
  nukeCreates.delete(key);
  return exp >= Date.now();
}

module.exports = {
  suppressChannelDelete,
  consumeChannelDelete,
  suppressChannelCreate,
  consumeChannelCreate,
  markCommandExit,
  getCommandExit,
  clearCommandExit,
  suppressMessage,
  isSuppressed,
  clearSuppressed,
  suppressRoleChange,
  unsuppressRoleChange,
  consumeRoleChange,
};
