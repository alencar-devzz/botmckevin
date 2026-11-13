const { Schema, model } = require("mongoose");

// Um ticket aberto (um tópico). Serve para limite por usuário, número, motivo e estatísticas.
const ticketRecordSchema = new Schema({
  guildId: { type: String, required: true, index: true },
  panelId: { type: String, required: true, index: true },
  threadId: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  optionKey: { type: String, required: true },
  number: { type: Number, default: 0 },
  reason: { type: String, default: null },
  claimedBy: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

module.exports = model("TicketRecord", ticketRecordSchema);
