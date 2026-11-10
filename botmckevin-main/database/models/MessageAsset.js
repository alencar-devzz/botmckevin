const { Schema, model, models } = require("mongoose");

// Imagens e áudio enviados no Criador de mensagens.
// Ficam no MongoDB (e não só como link do Discord) porque links de anexo do Discord expiram.
const messageAssetSchema = new Schema(
  {
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    kind: { type: String, enum: ["image", "audio"], required: true },
    name: { type: String, default: "arquivo" },
    contentType: { type: String, default: "" },
    ext: { type: String, required: true },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true },
    published: { type: Boolean, default: false }, // cópia usada por resposta de botão já publicada (não conta na cota do rascunho)
  },
  { timestamps: true }
);

messageAssetSchema.index({ guildId: 1, userId: 1, kind: 1 });

module.exports = models.MessageAsset || model("MessageAsset", messageAssetSchema);
