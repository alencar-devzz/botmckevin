const { onBotJoin } = require("./antiBot");
const { onAltJoin } = require("./antiAlt");

// Portão de entrada: Anti-bot e Anti-alt decidem UMA vez por membro, e a Portaria (cargos automáticos,
// boas-vindas) espera essa decisão. Antes os três rodavam ao mesmo tempo e quem era barrado ainda
// recebia cargo automático e mensagem de boas-vindas.

const TTL = 60_000;
const gates = new Map(); // "guild:user" -> Promise<boolean> (true = barrado)
const blocked = new Map(); // "guild:user" -> expira em

function runGate(member) {
  const key = `${member.guild.id}:${member.id}`;
  if (gates.has(key)) return gates.get(key);

  const promise = (async () => {
    let removed = false;
    try {
      removed = member.user.bot ? await onBotJoin(member) : await onAltJoin(member);
    } catch (err) {
      console.error("[ANTIRAID] Erro no portão de entrada:", err);
    }
    if (removed) blocked.set(key, Date.now() + TTL);
    return removed;
  })();

  gates.set(key, promise);
  setTimeout(() => gates.delete(key), TTL).unref?.();
  return promise;
}

// A pessoa/bot acabou de ser barrada pelo Anti-Raid? (para não mandar mensagem de saída)
function wasBlocked(guildId, userId) {
  const key = `${guildId}:${userId}`;
  const until = blocked.get(key);
  if (!until) return false;
  if (until < Date.now()) {
    blocked.delete(key);
    return false;
  }
  return true;
}

module.exports = { runGate, wasBlocked };
