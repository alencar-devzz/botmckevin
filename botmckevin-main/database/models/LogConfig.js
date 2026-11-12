const { Schema, model } = require("mongoose");

// Configuração de logs por servidor.
// categories = { mensagens: { enabled, channelId, ignoreBots }, calls: {...}, ... }
const logConfigSchema = new Schema({
  guildId: { type: String, required: true, unique: true },
  categories: { type: Schema.Types.Mixed },
});

module.exports = model("LogConfig", logConfigSchema);
