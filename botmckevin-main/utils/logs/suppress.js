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

module.exports = {
  suppressMessage,
  isSuppressed,
  clearSuppressed,
  suppressRoleChange,
  unsuppressRoleChange,
  consumeRoleChange,
};
