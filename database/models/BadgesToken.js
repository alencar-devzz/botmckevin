const { Schema, model, models } = require("mongoose");

// Token de conta Discord criptografado por usuário, para o sistema de badges HypeSquad.
const schema = new Schema({
  userId:    { type: String, required: true, unique: true },
  encrypted: { type: String, required: true }, // JSON: { iv, tag, data } em hex
  updatedAt: { type: Date, default: Date.now },
});

module.exports = models.BadgesToken ?? model("BadgesToken", schema);
