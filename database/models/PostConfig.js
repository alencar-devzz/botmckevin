const { Schema, model } = require("mongoose");

// Configuração do sistema "Posts e Instagram" por servidor
const postConfigSchema = new Schema({
  guildId: { type: String, required: true, unique: true },
  channelId: { type: String, default: null },
  enabled: { type: Boolean, default: true },
});

module.exports = model("PostConfig", postConfigSchema);
