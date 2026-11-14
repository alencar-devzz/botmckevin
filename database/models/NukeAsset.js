const { Schema, model, models } = require("mongoose");

// Imagem enviada como miniatura da mensagem do nnuke. Um arquivo por servidor: um novo envio
// substitui o anterior (upsert por guildId). Fica no MongoDB porque o link do anexo do modal expira.
const nukeAssetSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true },
    contentType: { type: String, default: "" },
    ext: { type: String, required: true },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true },
  },
  { timestamps: true }
);

module.exports = models.NukeAsset || model("NukeAsset", nukeAssetSchema);
