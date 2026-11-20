const { Schema, model } = require("mongoose");

// Estado de cada call do Gerenciador de calls (sobrevive a reinício do bot):
//  - touched: o painel foi usado nela (só essas calls são restauradas quando esvaziam)
//  - panelMessageId: painel enviado automaticamente no chat da call (para apagar/substituir depois)
const callPanelStateSchema = new Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true, unique: true },
  touched: { type: Boolean, default: false },
  panelMessageId: { type: String, default: null },
});

module.exports = model("CallPanelState", callPanelStateSchema);
