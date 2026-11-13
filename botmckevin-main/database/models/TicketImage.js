const { Schema, model } = require("mongoose");

// Imagens enviadas pelo menu de configuração dos tickets.
// Ficam guardadas aqui (e não só como link do Discord) porque links de anexo do Discord expiram.
const ticketImageSchema = new Schema({
  guildId: { type: String, required: true, index: true },
  panelId: { type: String, default: null, index: true },
  scope: { type: String, enum: ["panel", "internal", "portaria"], required: true },
  name: { type: String, default: "imagem" },
  contentType: { type: String, required: true },
  ext: { type: String, required: true },
  size: { type: Number, required: true },
  data: { type: Buffer, required: true },
});

module.exports = model("TicketImage", ticketImageSchema);
