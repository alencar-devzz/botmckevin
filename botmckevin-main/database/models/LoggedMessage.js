const { Schema, model, models } = require("mongoose");

// Cópia das mensagens do servidor, usada só pelo sistema de logs.
// Existe porque o cache do discord.js some quando o bot reinicia: sem isso, ao apagar/editar uma mensagem
// antiga o log vem sem autor e sem conteúdo. O Mongo apaga sozinho cada registro quando expireAt passa.
const loggedMessageSchema = new Schema({
  messageId: { type: String, required: true, unique: true },
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  authorId: { type: String, required: true },
  authorUsername: { type: String, default: "desconhecido" },
  authorAvatar: { type: String, default: null },
  authorBot: { type: Boolean, default: false },
  content: { type: String, default: "" },
  attachments: [{ _id: false, name: String, url: String }],
  expireAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
});

module.exports = models.LoggedMessage || model("LoggedMessage", loggedMessageSchema);
