const { onBotVoiceStateUpdate } = require("../utils/callKeeper");

module.exports = {
  name: "voiceStateUpdate",
  execute(oldState, newState) {
    // Estado de voz do próprio bot: o sistema de call (n!botcall) mantém o bot na call
    if (newState.id === newState.client.user.id) {
      try {
        onBotVoiceStateUpdate(oldState, newState);
      } catch (err) {
        console.error("[BOTCALL] Erro no evento de voz do bot:", err);
      }
    }
  },
};
