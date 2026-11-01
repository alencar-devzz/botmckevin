// Guarda, por ID da mensagem de confirmação, os dados da ação de moderação
// aguardando "Confirmar"/"Cancelar". Se ninguém interagir em 1 minuto,
// a mensagem é apagada e a ação é descartada (nada é executado).
const pendingModeration = new Map();

function setPendingModeration(messageId, data, expireMs) {
  const timeout = setTimeout(async () => {
    pendingModeration.delete(messageId);
    try {
      await data.message.delete();
    } catch {
      // a mensagem já pode ter sido apagada
    }
  }, expireMs);

  pendingModeration.set(messageId, { ...data, timeout });
}

// Remove a entrada do mapa e cancela o timeout de expiração.
// Retorna a entrada (ou undefined se não existir / já expirou).
function clearPendingModeration(messageId) {
  const entry = pendingModeration.get(messageId);
  if (entry?.timeout) clearTimeout(entry.timeout);
  pendingModeration.delete(messageId);
  return entry;
}

module.exports = { pendingModeration, setPendingModeration, clearPendingModeration };
