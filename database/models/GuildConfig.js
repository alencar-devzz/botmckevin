const { Schema, model } = require("mongoose");

const guildConfigSchema = new Schema({
  guildId: { type: String, required: true, unique: true },

  // Aparência / prefixo
  prefix: { type: String, default: null },

  // Portaria: boas-vindas
  welcomeChannel: { type: String, default: null },
  welcomeMessage: { type: String, default: null },
  welcomeEnabled: { type: Boolean, default: true },
  welcomeStyle: { type: String, enum: ["text", "container"], default: "text" },
  welcomeDeleteAfter: { type: Number, default: 0 }, // segundos (0 = não apagar)

  // Portaria: saídas
  leaveChannel: { type: String, default: null },
  leaveMessage: { type: String, default: null },
  leaveEnabled: { type: Boolean, default: true },
  leaveStyle: { type: String, enum: ["text", "container"], default: "text" },
  leaveDeleteAfter: { type: Number, default: 0 },

  // Portaria: mensagem na DM do membro que entrou
  dmEnabled: { type: Boolean, default: false },
  dmMessage: { type: String, default: null },

  // Portaria: cargos automáticos exclusivos para bots
  botAutoRoles: { type: [String], default: [] },

  // Portaria: filtro de contas novas (expulsa contas criadas há menos de X dias)
  accountFilterEnabled: { type: Boolean, default: false },
  accountMinAgeDays: { type: Number, default: 7 },

  // Auto-roles (membros)
  autoRoles: { type: [String], default: [] },

  // Logs do servidor
  logsChannel: { type: String, default: null },
});

module.exports = model("GuildConfig", guildConfigSchema);
