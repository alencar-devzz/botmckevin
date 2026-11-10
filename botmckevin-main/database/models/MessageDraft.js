const { Schema, model, models } = require("mongoose");

// Rascunho do Criador de mensagens (n!mensagem). Um rascunho por pessoa em cada servidor.
// "image", "thumb" e "audio.source" guardam um link (http...) ou "db:<id>" de um arquivo salvo em MessageAsset.
const buttonSchema = new Schema(
  {
    label: { type: String, default: "" },
    url: { type: String, default: "" }, // vazio = botão decorativo
    emoji: { type: String, default: "" },
    style: { type: String, default: "secondary" }, // secondary | primary | success | danger
    place: { type: String, default: "inside" }, // inside | below
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
  },
  { timestamps: true, minimize: false }
);

messageDraftSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = models.MessageDraft || model("MessageDraft", messageDraftSchema);
