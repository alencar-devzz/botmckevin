const { Schema, model } = require("mongoose");

// Convites (links) criados por cada pessoa. Quando o convite é apagado ou expira o registro continua,
// só ganha "deletedAt", para o total de "convites que a pessoa já fez" não diminuir.
const inviteLinkSchema = new Schema({
  guildId: { type: String, required: true },
  code: { type: String, required: true },
  inviterId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  deletedAt: { type: Date, default: null },
});

inviteLinkSchema.index({ guildId: 1, code: 1 }, { unique: true });
inviteLinkSchema.index({ guildId: 1, inviterId: 1 });

module.exports = model("InviteLink", inviteLinkSchema);
