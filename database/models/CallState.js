const { Schema, model } = require("mongoose");

// Guarda em qual call o bot deve ficar (persistência do botcall).
// active = true  -> o bot deve estar na call (reconecta sozinho se cair ou reiniciar)
// active = false -> foi desconectado de propósito (botão Desconectar ou staff), não volta sozinho
const callStateSchema = new Schema({
  guildId: { type: String, required: true, unique: true },
  channelId: { type: String, default: null },
  active: { type: Boolean, default: false },
});

module.exports = model("CallState", callStateSchema);
