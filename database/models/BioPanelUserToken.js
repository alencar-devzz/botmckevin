const { Schema, model } = require("mongoose");

// Token de usuário (criptografada) por userId.
// Cada usuário guarda a própria token para a verificação de perfil.
const bioPanelUserTokenSchema = new Schema({
  userId: { type: String, required: true, unique: true },
  tokenEnc: { type: String, default: null }, // iv:authTag:ciphertext (hex)
});

module.exports = model("BioPanelUserToken", bioPanelUserTokenSchema);
