const { MessageFlags, ContainerBuilder, TextDisplayBuilder } = require("discord.js");

// O painel principal expira se ninguém interagir (botões ou selects) por 5 minutos.
const TIMEOUT_MS = 5 * 60 * 1000;
const sessions = new Map(); // messageId -> { message, channelId, timer, prefix }

function expiredPanel(prefix) {
  return [
    new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent("## Menu de configurações"),
      new TextDisplayBuilder().setContent(
        `-# Este menu expirou por inatividade. Use \`${prefix}menu\` para abrir novamente.`
      )
    ),
  ];
}

async function expire(messageId) {
  const session = sessions.get(messageId);
  if (!session) return;
  sessions.delete(messageId);
  await session.message
    .edit({ components: expiredPanel(session.prefix), flags: MessageFlags.IsComponentsV2 })
    .catch(() => {}); // mensagem apagada ou sem permissão
}

function schedule(messageId) {
  const session = sessions.get(messageId);
  if (!session) return;
  clearTimeout(session.timer);
  session.timer = setTimeout(() => expire(messageId), TIMEOUT_MS);
}

function startMenuSession(message, prefix) {
  const old = sessions.get(message.id);
  if (old) clearTimeout(old.timer);
  sessions.set(message.id, { message, channelId: message.channelId, prefix, timer: null });
  schedule(message.id);
}

// Qualquer interação no menu (ou nos painéis efêmeros abertos a partir dele) renova os 5 minutos
function touchMenu(interaction) {
  const messageId = interaction.message?.id;
  if (messageId && sessions.has(messageId)) return schedule(messageId);

  const fromEphemeral = interaction.message?.flags?.has(MessageFlags.Ephemeral);
  if (!fromEphemeral) return;
  for (const [id, session] of sessions) {
    if (session.channelId === interaction.channelId) schedule(id);
  }
}

module.exports = { startMenuSession, touchMenu, TIMEOUT_MS };
