const { Schema, model } = require("mongoose");

// Uma linha por ENTRADA no servidor que o bot conseguiu ligar a um convite de alguém.
// "leftAt" é preenchido quando a pessoa sai. "accountAgeMs" (idade da conta no momento da entrada)
// permite mudar o limite de "conta recente" depois e recalcular tudo, sem reprocessar nada.
const inviteJoinSchema = new Schema({
  guildId: { type: String, required: true },
  inviterId: { type: String, required: true }, // quem criou o convite
  userId: { type: String, required: true }, // quem entrou
  code: { type: String, required: true },
  joinedAt: { type: Date, default: Date.now },
  leftAt: { type: Date, default: null },
  accountAgeMs: { type: Number, required: true },
});

inviteJoinSchema.index({ guildId: 1, inviterId: 1 });
inviteJoinSchema.index({ guildId: 1, userId: 1, joinedAt: -1 });
inviteJoinSchema.index({ guildId: 1, leftAt: 1 });

module.exports = model("InviteJoin", inviteJoinSchema);
