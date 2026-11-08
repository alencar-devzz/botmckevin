const { onBotVoiceStateUpdate } = require("../utils/callKeeper");
const { onVoiceStateUpdate: onCallHubVoiceState } = require("../utils/callHub");

module.exports = {
  name: "voiceStateUpdate",
  execute(oldState, newState) {
    // Estado de voz do próprio bot: mantém o botcall na call
    if (newState.id === newState.client.user.id) {
      onBotVoiceStateUpdate(oldState, newState);
    }

    // Calls temporárias (cria ao entrar no canal gatilho e apaga quando esvazia)
    onCallHubVoiceState(oldState, newState).catch((err) => console.error("[CALLS] Erro no evento de voz:", err));
  },
};
