const { Schema, model } = require("mongoose");

// Pessoas que estão AFK em cada servidor. Quando a pessoa volta a escrever, o registro é apagado.
const afkStatusSchema = new Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  reason: { type: String, default: null }, // null = a pessoa não informou motivo
  since: { type: Date, default: Date.now },
});

afkStatusSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = model("AfkStatus", afkStatusSchema);
