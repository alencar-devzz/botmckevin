const { MessageFlags, ContainerBuilder, TextDisplayBuilder } = require("discord.js");

// O painel do comando groles expira se ninguém interagir (botões, selects ou o modal de busca)
// por 5 minutos — mesmo prazo e mesmo esquema do n!menu (utils/menuSession.js).
const TIMEOUT_MS = 5 * 60 * 1000;
const sessions = new Map(); // messageId -> { message, prefix, timer }

function expiredPanel(prefix) {
  return [
    new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent("## Gerenciar cargos"),
      new TextDisplayBuilder().setContent(
        `-# Este painel expirou por inatividade. Use \`${prefix}groles\` para abrir de novo.`
      )
    ),
  ];
}

async function expire(messageId) {
  const session = sessions.get(messageId);
  if (!session) return;
  sessions.delete(messageId);
  await session.message
    .edit({
      components: expiredPanel(session.prefix),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    })
    .catch(() => {}); // mensagem apagada ou sem permissão
}

function schedule(messageId) {
  const session = sessions.get(messageId);
  if (!session) return;
  clearTimeout(session.timer);
  session.timer = setTimeout(() => expire(messageId), TIMEOUT_MS);
}

function startRolePanelSession(message, prefix) {
  const old = sessions.get(message.id);
  if (old) clearTimeout(old.timer);
  sessions.set(message.id, { message, prefix, timer: null });
  schedule(message.id);
}

// Qualquer interação no painel (botão, select ou o modal de busca) renova os 5 minutos
function touchRolePanel(interaction) {
  const messageId = interaction.message?.id;
  if (messageId && sessions.has(messageId)) schedule(messageId);
}

module.exports = { startRolePanelSession, touchRolePanel, TIMEOUT_MS };
