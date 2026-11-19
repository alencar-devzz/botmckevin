const { Schema, model } = require("mongoose");

// Dono de uma call depois de um "Transferir" (sobrevive a reinício do bot).
// Sem registro aqui, o dono é quem está na call e clica no painel.
const callOwnerSchema = new Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true, unique: true },
  ownerId: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = model("CallOwner", callOwnerSchema);
