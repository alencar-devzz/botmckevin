const { Schema, model } = require("mongoose");
const { TEXT_KEYS } = require("../../utils/callHubDefaults");

// Configuração do sistema "Calls temporárias" por servidor.
// IMPORTANTE: o mongoose descarta campos que não estão declarados aqui (strict mode),
// por isso todos os textos editáveis são gerados a partir de TEXT_KEYS.
const textFields = Object.fromEntries(TEXT_KEYS.map((key) => [key, { type: String, default: null }]));

const callHubConfigSchema = new Schema({
  guildId: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: true },

  triggerChannelId: { type: String, default: null }, // quem entra aqui ganha uma call
  categoryId: { type: String, default: null }, // null = mesma categoria do gatilho

  nameTemplate: { type: String, default: null }, // null = "{nametag}"
  defaultLimit: { type: Number, default: 0 }, // 0 = sem limite
  defaultPrivate: { type: Boolean, default: false }, // call nasce privada
  deleteDelay: { type: Number, default: 0 }, // segundos até apagar a call vazia
  autoTransfer: { type: Boolean, default: true }, // dono saiu: passa o controle para quem ficou
  sendPanel: { type: Boolean, default: true }, // envia o painel no chat da call
  cooldown: { type: Number, default: 0 }, // segundos entre uma criação e outra (por pessoa)

  allowedRoles: { type: [String], default: [] }, // vazio = todos podem criar
  blockedRoles: { type: [String], default: [] }, // nunca podem criar
  staffRoles: { type: [String], default: [] }, // podem usar o painel em qualquer call

  texts: textFields, // null = texto padrão
  color: { type: Number, default: null }, // null = sem cor
  thumbnail: { type: String, default: null }, // null = ícone do servidor | "none" | link
});

module.exports = model("CallHubConfig", callHubConfigSchema);
