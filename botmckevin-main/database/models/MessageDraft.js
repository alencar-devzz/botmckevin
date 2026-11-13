const { Schema, model, models } = require("mongoose");

// Rascunho do Criador de mensagens (n!mensagem). Um rascunho por pessoa em cada servidor.
// "image", "thumb" e "audio.source" guardam um link (http...) ou "db:<id>" de um arquivo salvo em MessageAsset.
// Botão que aparece dentro da resposta de outro botão (só botão de link)
const responseButtonSchema = new Schema(
  {
    label: { type: String, default: "" },
    url: { type: String, default: "" },
    emoji: { type: String, default: "" },
  },
  { _id: false }
);

// Resposta de um botão: o que aparece quando alguém clica nele (botão sem link)
const responseSchema = new Schema(
  {
    mode: { type: String, default: "none" }, // none | text | embed | v2
    text: { type: String, default: "" }, // texto puro, descrição da embed ou texto da caixa V2
    title: { type: String, default: "" }, // só embed
    footer: { type: String, default: "" }, // só embed
    image: { type: String, default: null }, // link ou "db:<id>"
    thumb: { type: String, default: null }, // link ou "db:<id>" (embed e V2)
    color: { type: String, default: null }, // chave de cor pronta ou #RRGGBB (embed e V2)
    hidden: { type: Boolean, default: true }, // true = só quem clicou vê
    buttons: { type: [responseButtonSchema], default: [] },
  },
  { _id: false }
);

const buttonSchema = new Schema(
  {
    label: { type: String, default: "" },
    url: { type: String, default: "" }, // vazio = botão decorativo
    emoji: { type: String, default: "" },
    style: { type: String, default: "secondary" }, // secondary | primary | success | danger
    place: { type: String, default: "inside" }, // inside | below
    response: { type: responseSchema, default: () => ({}) },
  },
  { _id: false }
);

const blockSchema = new Schema(
  {
    text: { type: String, default: "" },
    image: { type: String, default: null },
    thumb: { type: String, default: null },
    layout: { type: String, default: "box" }, // box | plain | image
    color: { type: String, default: null }, // chave de cor pronta ou #RRGGBB
    wide: { type: Boolean, default: false }, // espaçamento amplo entre as partes
    buttons: { type: [buttonSchema], default: [] },
  },
  { _id: false }
);

const messageDraftSchema = new Schema(
  {
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    blocks: { type: [blockSchema], default: [] },
    audio: {
      source: { type: String, default: null },
      name: { type: String, default: null },
    },
    channelId: { type: String, default: null },
    cursor: { type: Number, default: 0 },
    btnCursor: { type: Number, default: 0 }, // botão em edição na tela de resposta
  },
  { timestamps: true, minimize: false }
);

messageDraftSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = models.MessageDraft || model("MessageDraft", messageDraftSchema);
