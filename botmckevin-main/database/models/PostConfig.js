const { Schema, model } = require("mongoose");

// Configuração de um botão do post (emoji / cor / posição)
// emoji: null = emoji padrão | "👍" | "<:nome:id>" | "<a:nome:id>"
// style: secondary (cinza, sem cor) | primary (azul) | success (verde) | danger (vermelho)
// position: "top" (canto direito, em cima da embed) | "bottom" (linha de botões)
const buttonSchema = {
  emoji: { type: String, default: null },
  style: { type: String, default: "secondary" },
  position: { type: String, default: "bottom" },
};

// Configuração do sistema "Posts e Instagram" por servidor
const postConfigSchema = new Schema({
  guildId: { type: String, required: true, unique: true },
  channelId: { type: String, default: null },
  enabled: { type: Boolean, default: true },

  buttons: {
    like: { ...buttonSchema },
    comment: { ...buttonSchema },
    view: { ...buttonSchema, position: { type: String, default: "top" } },
    delete: { ...buttonSchema },
  },
  order: { type: [String], default: undefined }, // ordem dos botões na linha
  rowPosition: { type: String, default: "below" }, // linha "above" ou "below" da mídia
});

module.exports = model("PostConfig", postConfigSchema);
