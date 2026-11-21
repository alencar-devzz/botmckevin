const { Schema, model } = require("mongoose");

// Configuração de logs por servidor.
// categories = { mensagens: { enabled, channelId, ignoreBots }, calls: {...}, ... }
const logConfigSchema = new Schema({
  guildId: { type: String, required: true, unique: true },
  categories: { type: Schema.Types.Mixed },
  // Liga/desliga geral dos logs no /menu (padrão: ligado)
  enabled: { type: Boolean, default: true },
});

module.exports = model("LogConfig", logConfigSchema);
