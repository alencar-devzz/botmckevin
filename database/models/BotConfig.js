const { Schema, model } = require("mongoose");

// Documento único (_id fixo "global") pois nome/avatar/banner
// são propriedades globais do bot (client.user), não por servidor.
const botConfigSchema = new Schema({
  _id: { type: String, default: "global" },
  name: { type: String, default: null },
  avatar: { type: String, default: null },
  banner: { type: String, default: null },

  // Status (RPC) do bot: tipo de atividade, textos e presença
  presenceActivity: { type: String, default: null }, // playing, streaming, listening, watching, competing, custom ou none
  presenceName: { type: String, default: null },
  presenceState: { type: String, default: null },
  presenceUrl: { type: String, default: null },
  presenceStatus: { type: String, default: "online" }, // online, idle, dnd ou invisible
});

module.exports = model("BotConfig", botConfigSchema);
