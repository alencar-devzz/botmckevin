const { Schema, model, models } = require("mongoose");

// Atividade de cada pessoa no servidor, usada pelos requisitos dos sorteios
// (mensagens enviadas, tempo em call e convites que trouxeram gente).
const sorteioActivitySchema = new Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  messages: { type: Number, default: 0 },
  voiceMs: { type: Number, default: 0 },
  invites: { type: Number, default: 0 },
});

sorteioActivitySchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = models.SorteioActivity || model("SorteioActivity", sorteioActivitySchema);
