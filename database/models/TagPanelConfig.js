const { Schema, model } = require("mongoose");

// Botão de link extra da mensagem do painel (até 2 por painel)
const extraButtonSchema = new Schema(
  {
    label: { type: String, default: "" },
    url: { type: String, default: "" },
    emoji: { type: String, default: "" }, // só emoji do servidor: <:nome:id>
    place: { type: String, default: "inside" }, // inside | below
  },
  { _id: false }
);

// Um painel de cargo por tag por documento (vários painéis por servidor).
const panelSchema = new Schema(
  {
    panelId: { type: String, required: true }, // nanoid curto gerado na criação
    channelId: { type: String, default: null }, // canal onde o painel foi enviado
    messageId: { type: String, default: null }, // id da mensagem enviada

    // Mensagem do painel (editor: Texto, Mídia, Aparência e Botões)
    // message = texto completo com markdown e marcadores [separador]/[separador_largo].
    // Vazio = painéis antigos, que montam o texto a partir de title + description.
    message: { type: String, default: null },
    image: { type: String, default: null }, // link ou "db:<id>" (MessageAsset)
    thumb: { type: String, default: null }, // link ou "db:<id>"
    layout: { type: String, default: "box" }, // box | plain | image
    color: { type: String, default: null }, // chave de cor pronta ou #RRGGBB
    wide: { type: Boolean, default: false }, // espaçamento amplo
    buttonLabel: { type: String, default: "Verificar" },
    buttonEmoji: { type: String, default: null }, // <:nome:id>
    buttonStyle: { type: String, default: "success" }, // secondary | primary | success | danger
    buttonPlace: { type: String, default: "inside" }, // inside | below
    extraButtons: { type: [extraButtonSchema], default: [] },

    // Respostas personalizadas do botão Verificar (ok, fail, already, norole).
    // Cada uma: { mode: text | embed | v2, text, title, footer, image, thumb, color, buttons[] }.
    // Chave ausente = usa a resposta padrão.
    responses: { type: Schema.Types.Mixed, default: {} },

    // Cargos concedidos / removidos ao verificar
    giveRoles: { type: [String], default: [] },
    removeRoles: { type: [String], default: [] },

  },
  { _id: false }
);

const tagPanelConfigSchema = new Schema({
  guildId: { type: String, required: true, unique: true },

  // Liga/desliga geral do sistema no /menu (padrão: ligado)
  enabled: { type: Boolean, default: true },

  panels: { type: [panelSchema], default: [] },
});

module.exports = model("TagPanelConfig", tagPanelConfigSchema);
