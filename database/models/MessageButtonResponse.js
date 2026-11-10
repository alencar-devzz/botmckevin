const { Schema, model, models } = require("mongoose");

// Resposta de botão de uma mensagem JÁ PUBLICADA pelo Criador de mensagens.
// É uma cópia (snapshot) feita na hora de publicar: mexer ou limpar o rascunho depois não afeta
// as mensagens que já estão no canal. O botão publicado guarda só o id deste documento ("msg:r:<id>").
const messageButtonResponseSchema = new Schema(
  {
    guildId: { type: String, required: true },
    channelId: { type: String, default: null },
    messageId: { type: String, default: null, index: true },
    userId: { type: String, required: true }, // quem publicou
    response: { type: Schema.Types.Mixed, required: true }, // mode, text, title, footer, image, thumb, color, hidden, buttons
    sources: { type: [String], default: [] }, // "db:<id>" das imagens copiadas para esta resposta
  },
  { timestamps: true, minimize: false }
);

module.exports = models.MessageButtonResponse || model("MessageButtonResponse", messageButtonResponseSchema);
