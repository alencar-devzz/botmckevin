const { Schema, model } = require("mongoose");

// Histórico de incidentes do Anti-Raid: cada alerta enviado por qualquer módulo vira um registro.
// Os registros somem sozinhos depois de 60 dias (índice TTL do Mongo no campo "at").
const antiRaidIncidentSchema = new Schema({
  guildId: { type: String, required: true },
  system: { type: String, default: "Anti-Raid" }, // nome do sistema (Anti-spam, Núcleo...)
  action: { type: String, default: "" }, // o que aconteceu
  authorId: { type: String, default: null }, // quem fez, quando houver
  channelId: { type: String, default: null }, // onde aconteceu, quando houver
  fields: { type: [String], default: [] }, // linhas "Campo: valor" (inclui o resultado)
  content: { type: String, default: null }, // texto envolvido, quando houver
  at: { type: Date, default: Date.now, expires: 60 * 24 * 60 * 60 },
});

antiRaidIncidentSchema.index({ guildId: 1, at: -1 });
antiRaidIncidentSchema.index({ guildId: 1, system: 1, at: -1 });

module.exports = model("AntiRaidIncident", antiRaidIncidentSchema);
