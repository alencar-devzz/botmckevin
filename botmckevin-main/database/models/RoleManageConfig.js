const { Schema, model } = require("mongoose");
const { TEXT_KEYS } = require("../../utils/roleManageDefaults");

// Configuração do sistema "Gerenciamento de cargos" (comando groles) por servidor.
// IMPORTANTE: o mongoose descarta campos que não estão declarados aqui (strict mode),
// por isso todos os textos editáveis são gerados a partir de TEXT_KEYS.
const textFields = Object.fromEntries(TEXT_KEYS.map((key) => [key, { type: String, default: null }]));

const ruleSchema = new Schema(
  {
    managerId: { type: String, required: true }, // cargo que gerencia
    blocked: { type: [String], default: [] }, // cargos que ele NÃO pode gerenciar
  },
  { _id: false }
);

const roleManageConfigSchema = new Schema({
  guildId: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: true },

  // undefined = o servidor nunca editou: vale o padrão do código (utils/roleManageDefaults.js)
  rules: { type: [ruleSchema], default: undefined },

  texts: textFields, // null = texto padrão

  color: { type: Number, default: null }, // null = sem cor
  thumbnail: { type: String, default: null }, // null = automática | "none" | "server" | link
  perPage: { type: Number, default: 4 }, // cargos por página (3 a 5)
});

module.exports = model("RoleManageConfig", roleManageConfigSchema);
