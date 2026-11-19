const { Schema, model } = require("mongoose");
const { TEXT_KEYS, BUTTON_KEYS } = require("../../utils/callHubDefaults");
const { MESSAGE_KEYS } = require("../../utils/callHubMessages");

// Configuração do "Gerenciador de calls" por servidor.
// IMPORTANTE: o mongoose descarta campos que não estão declarados aqui (strict mode),
// por isso todos os textos editáveis são gerados a partir de TEXT_KEYS.
const textFields = Object.fromEntries(TEXT_KEYS.map((key) => [key, { type: String, default: null }]));

const styleFields = Object.fromEntries(BUTTON_KEYS.map((key) => [key, { type: String, default: null }]));

const msgFields = Object.fromEntries(MESSAGE_KEYS.map((key) => [key, { type: String, default: null }]));

const callHubConfigSchema = new Schema({
  guildId: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: true }, // desligado = o painel avisa que o gerenciador está desativado

  ignoredChannels: { type: [String], default: [] }, // calls onde o painel não funciona (ex.: calls da moderação)

  allowedRoles: { type: [String], default: [] }, // vazio = todos podem usar o painel
  blockedRoles: { type: [String], default: [] }, // nunca podem usar o painel
  staffRoles: { type: [String], default: [] }, // podem enviar o painel fixo (comando do painel)

  texts: textFields, // null = texto padrão
  color: { type: Number, default: null }, // null = sem cor
  thumbnail: { type: String, default: null }, // null = ícone do servidor | "none" | link

  msgs: msgFields, // mensagens e respostas do painel (null = texto padrão)
  hiddenButtons: { type: [String], default: [] }, // botões escondidos do painel
  panelMode: { type: String, default: null }, // "select" = menus de seleção | null = botões
  styles: styleFields, // cor de cada botão do painel (null = cor padrão)
  panelLegend: { type: Boolean, default: null }, // mostra a legenda com a descrição dos botões (null = sim)
  panelDividers: { type: Boolean, default: null }, // linhas divisórias entre as seções (null = sim)
});

module.exports = model("CallHubConfig", callHubConfigSchema);
