const { Schema, model } = require("mongoose");

// Configuração do comando "cl" (apaga as mensagens de quem digitou) por servidor.
// IMPORTANTE: o mongoose descarta campos que não estão declarados aqui (strict mode).
const clConfigSchema = new Schema({
  guildId: { type: String, required: true, unique: true },

  enabled: { type: Boolean, default: true },

  // Quem pode usar: "staff" = equipe + cargos extras | "roles" = só cargos escolhidos | "everyone" = todos
  access: { type: String, enum: ["staff", "roles", "everyone"], default: "staff" },
  roles: { type: [String], default: [] }, // cargos permitidos
  blockedRoles: { type: [String], default: [] }, // cargos que NUNCA podem usar

  allowedChannels: { type: [String], default: [] }, // vazio = todos os canais
  blockedChannels: { type: [String], default: [] }, // canais onde o comando não funciona

  scope: { type: String, enum: ["channel", "guild"], default: "channel" }, // só no canal atual ou em todos
  amount: { type: Number, default: 0 }, // 0 = todas as mensagens encontradas
  scanLimit: { type: Number, default: 1000 }, // quantas mensagens recentes de cada canal ele examina

  includeOld: { type: Boolean, default: true }, // inclui mensagens com mais de 14 dias (apagadas uma a uma)
  skipPinned: { type: Boolean, default: false }, // mantém mensagens fixadas
  deleteTrigger: { type: Boolean, default: true }, // apaga o próprio "cl"
  cooldown: { type: Number, default: 0 }, // segundos entre usos (0 = sem espera)
  cooldownExemptRoles: { type: [String], default: [] }, // cargos que ignoram a espera

  notice: { type: Boolean, default: false }, // avisa no canal quantas foram apagadas
  noticeSeconds: { type: Number, default: 5 },
  sendLog: { type: Boolean, default: true }, // registra uma embed no log de mensagens
});

module.exports = model("ClConfig", clConfigSchema);
