const MENTION_REGEX = /^<@!?(\d+)>$/;
const ID_REGEX = /^\d{17,20}$/;

// Resolve o usuário-alvo de um comando de moderação a partir de:
// 1) a mensagem respondida (reply), se houver;
// 2) uma menção, ID ou nome/tag presente nos argumentos (em qualquer posição).
// O restante dos argumentos (sem o token do usuário) vira o "motivo".
async function resolveTarget(message, args) {
  const guild = message.guild;
  let targetId = null;
  let argIndex = -1;

  // 1) Prioridade: usuário da mensagem respondida
  if (message.reference) {
    try {
      const replied = await message.fetchReference();
      targetId = replied.author.id;
    } catch {
      // segue tentando pelos argumentos
    }
  }

  // 2) Procura menção, ID ou nome/tag nos argumentos
  if (!targetId) {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      const mentionMatch = arg.match(MENTION_REGEX);
      if (mentionMatch) {
        targetId = mentionMatch[1];
        argIndex = i;
        break;
      }

      if (ID_REGEX.test(arg)) {
        targetId = arg;
        argIndex = i;
        break;
      }

      const cached = guild.members.cache.find(
        (m) =>
          m.user.username.toLowerCase() === arg.toLowerCase() ||
          m.user.tag?.toLowerCase() === arg.toLowerCase() ||
          m.displayName.toLowerCase() === arg.toLowerCase()
      );

      const found =
        cached ||
        (await guild.members
          .fetch({ query: arg, limit: 1 })
          .then((r) => r.first())
          .catch(() => null));

      if (found) {
        targetId = found.id;
        argIndex = i;
        break;
      }
    }
  }

  if (!targetId) {
    return {
      error:
        "Não consegui identificar o usuário. Informe uma menção, ID ou nome, ou responda à mensagem da pessoa.",
    };
  }

  const reasonArgs =
    argIndex >= 0 ? [...args.slice(0, argIndex), ...args.slice(argIndex + 1)] : args;
  const reason = reasonArgs.join(" ").trim() || null;

  let member = null;
  try {
    member = await guild.members.fetch(targetId);
  } catch {
    member = null;
  }

  let user = member?.user ?? null;
  if (!user) {
    try {
      user = await message.client.users.fetch(targetId);
    } catch {
      user = null;
    }
  }

  if (!user) {
    return { error: "Não encontrei nenhum usuário com essas informações." };
  }

  return { user, member, reason };
}

module.exports = { resolveTarget };
