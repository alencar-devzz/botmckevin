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

module.exports = {
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
