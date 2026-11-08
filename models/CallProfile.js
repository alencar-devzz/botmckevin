const { Schema, model } = require("mongoose");

// Configuração pessoal de cada dono de call (botões Salvar Config / Usar Config / Blacklist)
const callProfileSchema = new Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },

  hasSaved: { type: Boolean, default: false }, // já usou "Salvar Config"
  limit: { type: Number, default: 0 },
  locked: { type: Boolean, default: false },
  allowed: { type: [String], default: [] }, // quem tinha acesso quando salvou

  blacklist: { type: [String], default: [] }, // bloqueados em TODAS as calls dessa pessoa
});

callProfileSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = model("CallProfile", callProfileSchema);
