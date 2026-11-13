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
  welcomeTitle: { type: String, default: null }, // null = padrão, "" = sem título
  welcomeFooter: { type: String, default: null }, // null = padrão, "" = sem rodapé
  welcomeColor: { type: Number, default: null }, // null = sem cor
  welcomeImages: { type: [String], default: [] }, // links ou "db:<id>"
  welcomeThumb: { type: String, default: "avatar" }, // avatar | server | none | link

  // Portaria: saídas
  leaveChannel: { type: String, default: null },
  leaveMessage: { type: String, default: null },
  leaveEnabled: { type: Boolean, default: true },
  leaveStyle: { type: String, enum: ["text", "container"], default: "text" },
  leaveDeleteAfter: { type: Number, default: 0 },
  leaveTitle: { type: String, default: null },
  leaveFooter: { type: String, default: null },
  leaveColor: { type: Number, default: null },
  leaveImages: { type: [String], default: [] },
  leaveThumb: { type: String, default: "avatar" },

  // Portaria: mensagem na DM do membro que entrou
  dmEnabled: { type: Boolean, default: false },
  dmMessage: { type: String, default: null },
  dmStyle: { type: String, enum: ["text", "container"], default: "container" },
  dmTitle: { type: String, default: null },
  dmFooter: { type: String, default: null },
  dmColor: { type: Number, default: null },
  dmImages: { type: [String], default: [] },
  dmThumb: { type: String, default: "none" },

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
