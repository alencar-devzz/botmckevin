const { Schema, model } = require("mongoose");

// Estado do Bump Reminder por servidor: quem deu o último bump e quando avisar de novo.
const bumpStateSchema = new Schema({
  guildId: { type: String, required: true, unique: true },

  lastBumperId: { type: String, default: "" }, // quem deu o último bump (marcado no próximo lembrete)
  lastBumpAt: { type: Date, default: null },
  lastChannelId: { type: String, default: "" }, // canal do último bump

  nextBumpAt: { type: Date, default: null }, // quando o lembrete deve sair
  reminderSent: { type: Boolean, default: true }, // true = nada pendente
  reminderMessageId: { type: String, default: "" }, // último lembrete enviado (para apagar depois)
  reminderChannelId: { type: String, default: "" },

  totalBumps: { type: Number, default: 0 },
});

module.exports = model("BumpState", bumpStateSchema);
