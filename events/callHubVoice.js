const { handleVoiceUpdate } = require("../utils/callHubAuto");

// Gerenciador de calls: painel automático, apagar painel e restaurar call quando esvazia.
// Tudo é configurado em n!menu → Comunidade e interação → Gerenciador de calls → Comportamento.
module.exports = {
  name: "voiceStateUpdate",
  async execute(oldState, newState) {
    try {
      await handleVoiceUpdate(oldState, newState);
    } catch (err) {
      console.error("[CALLS] Erro no evento de voz do gerenciador de calls:", err);
    }
  },
};
