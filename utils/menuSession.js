const { MessageFlags, ContainerBuilder, TextDisplayBuilder } = require("discord.js");

// O /menu (mensagem efêmera) expira se ninguém interagir (botões, selects ou modais) por 5 minutos.
const TIMEOUT_MS = 5 * 60 * 1000;
// Mensagem efêmera só pode ser editada pelo token da interação, que vale 15 minutos.
const TOKEN_LIFETIME_MS = 14 * 60 * 1000;
const sessions = new Map(); // messageId -> { interaction, userId, channelId, createdAt, timer }

function expiredPanel() {
  return [
    new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent("## Menu de configurações"),
      new TextDisplayBuilder().setContent("-# Este menu expirou por inatividade. Use `/menu` para abrir novamente.")
    ),
  ];
}

async function expire(messageId) {
  const session = sessions.get(messageId);
  if (!session) return;
  sessions.delete(messageId);
  // Token da interação vencido: não dá mais para editar a mensagem
  if (Date.now() - session.createdAt > TOKEN_LIFETIME_MS) return;
  await session.interaction
    .editReply({ components: expiredPanel(), flags: MessageFlags.IsComponentsV2 })
    .catch(() => {}); // mensagem dispensada ou token inválido
}

function schedule(messageId) {
  const session = sessions.get(messageId);
  if (!session) return;
  clearTimeout(session.timer);
  session.timer = setTimeout(() => expire(messageId), TIMEOUT_MS);
}

// interaction: o /menu que abriu o painel · message: a resposta efêmera já enviada
function startMenuSession(interaction, message) {
  const old = sessions.get(message.id);
  if (old) clearTimeout(old.timer);
  sessions.set(message.id, {
    interaction,
    userId: interaction.user.id,
    channelId: interaction.channelId,
    createdAt: Date.now(),
    timer: null,
  });
  schedule(message.id);
}

// Qualquer interação no menu (ou nos painéis efêmeros abertos a partir dele) renova os 5 minutos
function touchMenu(interaction) {
  const messageId = interaction.message?.id;
  if (messageId && sessions.has(messageId)) return schedule(messageId);

  // Painel efêmero novo aberto a partir do menu: renova os menus da mesma pessoa neste canal
  const fromEphemeral = interaction.message?.flags?.has(MessageFlags.Ephemeral);
  if (!fromEphemeral) return;
  for (const [id, session] of sessions) {
    if (session.userId === interaction.user.id && session.channelId === interaction.channelId) schedule(id);
  }
}

// Página da lista de sistemas (Comunidade/Moderação) em que a pessoa estava, para o Voltar cair nela
const categoryPages = new Map(); // `${messageId}:${group}` -> página
const MAX_REMEMBERED = 500;

function rememberCategoryPage(messageId, group, page) {
  if (!messageId) return;
  const key = `${messageId}:${group}`;
  categoryPages.delete(key);
  categoryPages.set(key, page);
  if (categoryPages.size > MAX_REMEMBERED) categoryPages.delete(categoryPages.keys().next().value);
}

const recallCategoryPage = (messageId, group) => categoryPages.get(`${messageId}:${group}`) ?? 0;

module.exports = { startMenuSession, touchMenu, rememberCategoryPage, recallCategoryPage, TIMEOUT_MS };
