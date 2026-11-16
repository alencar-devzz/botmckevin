const { Schema, model, models } = require("mongoose");

// Sorteios do comando /sorteio. Um documento por sorteio (rascunho, em andamento ou encerrado).
// IMPORTANTE: o mongoose descarta campos que não estão declarados aqui (strict mode).

const blockSchema = new Schema(
  {
    text: { type: String, default: "" },
    image: { type: String, default: null }, // "db:<id>" (arquivo guardado) ou link
    thumb: { type: String, default: null },
    color: { type: String, default: null }, // nome da cor pronta ou #RRGGBB
    wide: { type: Boolean, default: false }, // espaço grande entre texto e imagem
  },
  { _id: false }
);

const buttonSchema = new Schema(
  {
    visible: { type: Boolean, default: true },
    label: { type: String, default: "" },
    emoji: { type: String, default: "" },
    style: { type: String, default: "primary" }, // primary | secondary | success | danger
  },
  { _id: false }
);

const sorteioSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    name: { type: String, default: "Sorteio" },
    prize: { type: String, default: "" },
    winners: { type: Number, default: 1 },
    durationMs: { type: Number, default: 0 },
    hostId: { type: String, default: "" },

    status: { type: String, enum: ["draft", "active", "ended"], default: "draft", index: true },
    channelId: { type: String, default: "" },
    messageId: { type: String, default: "" },
    startedAt: { type: Date, default: null },
    endsAt: { type: Date, default: null, index: true },
    endedAt: { type: Date, default: null },

    entryMode: { type: String, enum: ["button", "reaction"], default: "button" },
    reactionEmoji: { type: String, default: "" },

    layout: { type: String, enum: ["container", "loose"], default: "container" },
    place: { type: String, enum: ["inside", "below"], default: "inside" }, // onde ficam os botões
    blocks: { type: [blockSchema], default: [] },
    mainButton: { type: buttonSchema, default: () => ({}) },
    partButton: { type: buttonSchema, default: () => ({}) },

    dm: {
      enabled: { type: Boolean, default: false },
      text: { type: String, default: "" },
    },

    req: {
      callMin: { type: Number, default: 0 },
      messages: { type: Number, default: 0 },
      invites: { type: Number, default: 0 },
      patterns: { type: [String], default: [] },
      where: { type: [String], default: [] }, // "status" | "tag"
      monitor: { type: Boolean, default: true },
    },

    extras: { type: [new Schema({ roleId: String, extra: { type: Number, default: 1 } }, { _id: false })], default: [] },

    entries: { type: [new Schema({ userId: String, at: { type: Date, default: Date.now } }, { _id: false })], default: [] },
    winnerIds: { type: [String], default: [] },
    rerolls: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = models.Sorteio || model("Sorteio", sorteioSchema);
