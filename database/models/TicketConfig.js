const { Schema, model } = require("mongoose");

// Opção (categoria) do select menu do painel de tickets
const optionSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    description: { type: String, default: null },
    title: { type: String, required: true },
    message: { type: String, default: null }, // mensagem interna própria desta opção
  },
  { _id: false }
);

const panelRefSchema = new Schema(
  {
    channelId: { type: String, required: true },
    messageId: { type: String, required: true },
  },
  { _id: false }
);

// Configuração do sistema de tickets (um documento por servidor).
// Campos ausentes/nulos = usa o padrão definido em utils/ticketSettings.js
const ticketConfigSchema = new Schema({
  guildId: { type: String, required: true, unique: true },

  // Painel externo (onde o membro abre o ticket)
  panelTitle: { type: String, default: null },
  panelDescription: { type: String, default: null },
  panelPlaceholder: { type: String, default: null },
  panelImages: { type: [String], default: undefined },

  // Ticket interno (dentro do tópico)
  internalHeading: { type: String, default: null },
  internalMessage: { type: String, default: null },
  claimedMessage: { type: String, default: null },
  threadName: { type: String, default: null },
  internalImages: { type: [String], default: undefined },

  // Opções do select menu
  options: { type: [optionSchema], default: undefined },

  // Cargos: undefined = padrão, [] = nenhum
  attendRoles: { type: [String], default: undefined },
  mentionRoles: { type: [String], default: undefined },

  // Painéis enviados (atualizados automaticamente quando a configuração muda)
  panels: { type: [panelRefSchema], default: [] },
});

module.exports = model("TicketConfig", ticketConfigSchema);
