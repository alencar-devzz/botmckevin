const { onBotVoiceStateUpdate } = require("../utils/callKeeper");
const { onVoiceStateUpdate: onCallHubVoiceState } = require("../utils/callHub");

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

    // Calls temporárias (cria ao entrar no canal gatilho e apaga quando esvazia)
    onCallHubVoiceState(oldState, newState).catch((err) => console.error("[CALLS] Erro no evento de voz:", err));
  },
};
