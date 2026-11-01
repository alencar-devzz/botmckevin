const { onBotVoiceStateUpdate } = require("../utils/callKeeper");

module.exports = {
  name: "voiceStateUpdate",
  execute(oldState, newState) {
    // Só interessa o estado de voz do próprio bot
    if (newState.id !== newState.client.user.id) return;
    onBotVoiceStateUpdate(oldState, newState);
  },
};
