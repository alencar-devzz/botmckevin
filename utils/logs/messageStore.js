const LoggedMessage = require("../../database/models/LoggedMessage");

// Quanto tempo cada mensagem fica guardada no Mongo (depois disso ela é apagada automaticamente)
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
const MAX_CONTENT = 4000;

// Converte a mensagem do Discord no documento que vai pro Mongo (null se não for uma mensagem de servidor)
function toDoc(message) {
  if (!message?.guildId || !message.author || message.system) return null;
  return {
    messageId: message.id,
    guildId: message.guildId,
    channelId: message.channelId,
    authorId: message.author.id,
    authorUsername: message.author.username,
    authorAvatar: message.author.displayAvatarURL({ size: 128 }),
    authorBot: Boolean(message.author.bot),
    content: String(message.content ?? "").slice(0, MAX_CONTENT),
    attachments: [...(message.attachments?.values() ?? [])].map((a) => ({ name: a.name, url: a.url })),
    expireAt: new Date(Date.now() + RETENTION_MS),
  };
}

// Salva uma mensagem nova (nunca lança erro: o log não pode derrubar o bot)
async function saveMessage(message) {
  try {
    const doc = toDoc(message);
    if (!doc) return;
    await LoggedMessage.updateOne({ messageId: doc.messageId }, { $set: doc }, { upsert: true });
  } catch (err) {
    console.error("[LOGS] Erro ao salvar mensagem no Mongo:", err.message);
  }
}

// Busca o que foi salvo de uma mensagem (null se não existir)
async function getStored(messageId) {
  try {
    return await LoggedMessage.findOne({ messageId }).lean();
  } catch (err) {
    console.error("[LOGS] Erro ao ler mensagem do Mongo:", err.message);
    return null;
  }
}

// Busca várias de uma vez (apagamento em massa) -> Map messageId -> doc
async function getManyStored(ids) {
  try {
    const docs = await LoggedMessage.find({ messageId: { $in: ids } }).lean();
    return new Map(docs.map((d) => [d.messageId, d]));
  } catch (err) {
    console.error("[LOGS] Erro ao ler mensagens do Mongo:", err.message);
    return new Map();
  }
}

// Atualiza o texto de uma mensagem editada e devolve como ela estava ANTES (null se não estava salva)
async function swapContent(message) {
  try {
    const doc = toDoc(message);
    if (!doc) return null;
    return await LoggedMessage.findOneAndUpdate(
      { messageId: doc.messageId },
      { $set: doc },
      { upsert: true, new: false }
    ).lean();
  } catch (err) {
    console.error("[LOGS] Erro ao atualizar mensagem no Mongo:", err.message);
    return null;
  }
}

function removeStored(ids) {
  const list = Array.isArray(ids) ? ids : [ids];
  LoggedMessage.deleteMany({ messageId: { $in: list } }).catch((err) =>
    console.error("[LOGS] Erro ao apagar mensagem do Mongo:", err.message)
  );
}

// Usuário "de mentira" montado a partir do que foi salvo, para quando o Discord não entrega o autor
function authorFromStored(stored) {
  if (!stored) return null;
  return {
    id: stored.authorId,
    username: stored.authorUsername,
    bot: stored.authorBot,
    displayAvatarURL: () => stored.authorAvatar ?? undefined,
  };
}

module.exports = { saveMessage, getStored, getManyStored, swapContent, removeStored, authorFromStored };
