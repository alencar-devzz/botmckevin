const { Schema, model } = require("mongoose");

// Referência de um painel do n!botcall que deve ser atualizado em tempo real
const panelRefSchema = new Schema(
  {
    channelId: { type: String, required: true },
    messageId: { type: String, required: true },
  },
  { _id: false }
);

// Estado do sistema de call do bot (um documento por servidor).
//
// active = true  -> o bot DEVE estar na call (reconecta sozinho se cair ou se o bot reiniciar)
// active = false -> o bot foi desconectado de propósito (botão Desconectar ou um membro) e NÃO volta sozinho
//
// stopReason explica por que está inativo: "button" | "member" | "channel_deleted" | null
const callStateSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true },
    channelId: { type: String, default: null },
    active: { type: Boolean, default: false },
    stopReason: { type: String, default: null },

    // Painéis do n!botcall acompanhados em tempo real (os mais recentes)
    panels: { type: [panelRefSchema], default: [] },

    // Campos da versão antiga (um painel só). São lidos e migrados para "panels" ao iniciar.
    panelChannelId: { type: String, default: null },
    panelMessageId: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = model("CallState", callStateSchema);
