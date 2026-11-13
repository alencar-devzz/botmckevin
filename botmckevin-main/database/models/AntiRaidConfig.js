const { Schema, model } = require("mongoose");

// Configuração do Anti-Raid por servidor.
// Tudo fica em "cfg" (Mixed) porque cada parte do sistema acrescenta módulos novos;
// os valores padrão ficam em utils/antiraid/defaults.js e são mesclados na leitura.
const antiRaidConfigSchema = new Schema({
  guildId: { type: String, required: true, unique: true },
  cfg: { type: Schema.Types.Mixed, default: {} },
});

module.exports = model("AntiRaidConfig", antiRaidConfigSchema);
