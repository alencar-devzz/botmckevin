const { Schema, model } = require("mongoose");

// Configuração do Bump Reminder por servidor (n!menu > Moderação > Bump reminder).
// IMPORTANTE: o mongoose descarta campos que não estão declarados aqui (strict mode).

// Uma mensagem configurável (lembrete ou agradecimento).
// Os textos NÃO têm default aqui de propósito: campo ausente = usa o padrão de utils/bump/defaults.js;
// campo salvo como "" = o usuário limpou de propósito.
const messageSchema = new Schema(
  {
    mode: { type: String, enum: ["text", "embed"], default: "text" },

    // Modo texto
    text: { type: String },

    // Modo embed
    embedTitle: { type: String },
    embedUrl: { type: String }, // link do título
    embedDescription: { type: String },
    embedColor: { type: String }, // hex
    embedFooter: { type: String },
    embedFooterIcon: { type: String },
    embedAuthor: { type: String },
    embedAuthorIcon: { type: String },
    embedThumbnail: { type: String },
    embedImage: { type: String },
    embedTimestamp: { type: Boolean, default: false },
  },
  { _id: false }
);

const bumpConfigSchema = new Schema({
  guildId: { type: String, required: true, unique: true },

  enabled: { type: Boolean, default: false }, // o sistema inteiro

  channelId: { type: String, default: "" }, // canal do lembrete (vazio = último canal em que deram bump)
  bumpBotId: { type: String, default: "302050872383242240" }, // DISBOARD
  commandName: { type: String, default: "bump" }, // comando que conta como bump
  intervalMinutes: { type: Number, default: 120 }, // tempo entre bumps
  repeatMinutes: { type: Number, default: 0 }, // repete o lembrete se ninguém bumpar (0 = não repete)
  successKeywords: { type: [String], default: undefined }, // palavras que confirmam o bump (vazio = padrão)

  // Lembrete
  remind: { type: Boolean, default: true }, // envia o lembrete
  mentionLastBumper: { type: Boolean, default: true }, // marca quem deu o último bump
  mentionRoles: { type: [String], default: [] }, // cargos marcados no lembrete
  deleteOldReminder: { type: Boolean, default: false }, // apaga o lembrete antigo quando alguém dá bump

  // Agradecimento
  thank: { type: Boolean, default: true }, // agradece quando alguém dá bump
  thanksMention: { type: Boolean, default: false }, // marca quem deu bump no agradecimento

  reminder: { type: messageSchema, default: () => ({}) },
  thanks: { type: messageSchema, default: () => ({}) },
});

module.exports = model("BumpConfig", bumpConfigSchema);
