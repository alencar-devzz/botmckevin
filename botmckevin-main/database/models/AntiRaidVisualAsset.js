const { Schema, model, models } = require("mongoose");

// Imagens da referência do "Visual do servidor" (ícone, banner e fundos), guardadas em base64.
// Ficam separadas da configuração para não estourar o limite de 16 MB de um documento.
const schema = new Schema(
  {
    guildId: { type: String, required: true },
    kind: { type: String, required: true }, // icon | banner | splash | discoverySplash
    hash: { type: String, required: true }, // hash do Discord da imagem guardada
    data: { type: String, required: true }, // conteúdo em base64
  },
  { timestamps: true }
);

schema.index({ guildId: 1, kind: 1 }, { unique: true });

module.exports = models.AntiRaidVisualAsset || model("AntiRaidVisualAsset", schema);
