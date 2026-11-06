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

module.exports = { suppressMessage, isSuppressed, clearSuppressed };
