const { Schema, model } = require("mongoose");

// Um painel de verificação por documento (vários painéis por servidor).
const panelSchema = new Schema(
  {
    panelId: { type: String, required: true }, // nanoid curto gerado na criação
    channelId: { type: String, default: null }, // canal onde o painel foi enviado
    messageId: { type: String, default: null }, // id da mensagem enviada

    // Aparência do painel (tudo editável pelo menu)
    title: { type: String, default: "Verificação de perfil" },
    description: { type: String, default: "Clique no botão abaixo para verificar seu perfil." },
    buttonLabel: { type: String, default: "Verificar" },
    buttonEmoji: { type: String, default: null }, // emoji unicode ou <:nome:id>
    successText: { type: String, default: "Perfil verificado com sucesso!" },
    failText: { type: String, default: "Seu perfil não contém o padrão exigido." },

    // Cargos concedidos / removidos ao verificar
    giveRoles: { type: [String], default: [] },
    removeRoles: { type: [String], default: [] },

    // O que verificar: bio | status | pronouns (qualquer combinação)
    checkBio: { type: Boolean, default: true },
    checkStatus: { type: Boolean, default: false },
    checkPronouns: { type: Boolean, default: false },

    // Padrões exigidos (todos os que estiverem ativos DEVEM aparecer no campo)
    patterns: { type: [String], default: [] }, // strings literais (case-insensitive)
  },
  { _id: false }
);

const bioPanelConfigSchema = new Schema({
  guildId: { type: String, required: true, unique: true },

  // Token de usuário (criptografada com AES-256-GCM); null = não definida
  tokenEnc: { type: String, default: null }, // iv:authTag:ciphertext (hex)

  panels: { type: [panelSchema], default: [] },
});

module.exports = model("BioPanelConfig", bioPanelConfigSchema);
