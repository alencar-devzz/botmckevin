const { Schema, model } = require("mongoose");

// Opção (categoria) do select menu. No modo botão, a primeira opção é o "tipo" do ticket.
const optionSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    description: { type: String, default: null },
    title: { type: String, required: true },
    message: { type: String, default: null }, // mensagem interna própria desta opção
    staffRoles: { type: [String], default: undefined }, // cargos próprios desta opção (undefined = usa os do painel)
  },
  { _id: false }
);

// Mensagem do painel já enviada (atualizada automaticamente quando a configuração muda)
const sentSchema = new Schema(
  {
    channelId: { type: String, required: true },
    messageId: { type: String, required: true },
  },
  { _id: false }
);

// Um painel de tickets. Cada servidor pode ter vários.
// Campos nulos/ausentes = usa o padrão de utils/ticketSettings.js
const ticketPanelSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    mode: { type: String, enum: ["select", "button"], default: "select" },
    enabled: { type: Boolean, default: true },

    // Aparência do painel público
    title: { type: String, default: null },
    description: { type: String, default: null },
    footer: { type: String, default: null },
    color: { type: Number, default: null },
    showInfo: { type: Boolean, default: true },
    panelImages: { type: [String], default: undefined },

    // Abertura
    placeholder: { type: String, default: null },
    buttonLabel: { type: String, default: null },
    buttonStyle: { type: String, default: null }, // primary | secondary | success | danger
    options: { type: [optionSchema], default: undefined },

    // Ticket interno
    internalHeading: { type: String, default: null },
    internalMessage: { type: String, default: null },
    claimedMessage: { type: String, default: null },
    threadName: { type: String, default: null },
    internalImages: { type: [String], default: undefined },
    ticketChannelId: { type: String, default: null }, // onde os tópicos são criados (padrão: canal do painel)
    archiveMinutes: { type: Number, default: null },
    showOptionLine: { type: Boolean, default: true }, // mostra "Opção selecionada" no ticket
    showTicketFooter: { type: Boolean, default: true }, // mostra o rodapé "Painel · Ticket N° · Aberto há"
    showAuthorLine: { type: Boolean, default: true }, // mostra "Aberto por" no ticket
    internalColor: { type: Number }, // cor fixa do container do ticket (não muda ao assumir)
    claimedColor: { type: Number }, // cor da mensagem enviada quando alguém assume

    // Efêmera de "limite de tickets atingido"
    limitTitle: { type: String, default: null },
    limitMessage: { type: String, default: null },
    limitColor: { type: Number },

    // Confirmação antes de finalizar/excluir o ticket
    closeConfirmTitle: { type: String, default: null },
    closeConfirmMessage: { type: String, default: null },
    closeConfirmButtonLabel: { type: String, default: null },
    closeConfirmColor: { type: Number },

    // Cargos: undefined = padrão, [] = nenhum
    attendRoles: { type: [String], default: undefined },
    mentionRoles: { type: [String], default: undefined },

    // Regras
    maxPerUser: { type: Number, default: null }, // null = 1 | 0 = sem limite
    askReason: { type: Boolean, default: false },
    confirmClose: { type: Boolean, default: false },

    // Mensagem efêmera de confirmação ao abrir o ticket
    successTitle: { type: String, default: null },
    successMessage: { type: String, default: null },
    successColor: { type: Number }, // sem default: ausente = usa o padrão (verde)
    successButtonLabel: { type: String, default: null },
    successButtonEnabled: { type: Boolean, default: true },

    sent: { type: [sentSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = model("TicketPanel", ticketPanelSchema);
