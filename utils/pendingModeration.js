// Guarda, por ID da mensagem de confirmação, os dados da ação de moderação
// aguardando "Confirmar"/"Cancelar".
// Com expireMs, se ninguém interagir a mensagem é apagada e a ação é descartada.
// Sem expireMs (null/0), a confirmação não expira: fica valendo até alguém clicar
// (ou até o bot reiniciar).
const pendingModeration = new Map();

function setPendingModeration(messageId, data, expireMs) {
  let timeout = null;

  if (expireMs) {
    timeout = setTimeout(async () => {
      pendingModeration.delete(messageId);
      try {
        await data.message.delete();
      } catch {
        // a mensagem já pode ter sido apagada
      }
    }, expireMs);
  }

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
