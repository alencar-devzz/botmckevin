const CallRoom = require("../database/models/CallRoom");
const { forgetOwner, clearCallState } = require("../utils/callHub");
const { cancelEmptyTimer } = require("../utils/callHubAuto");

// Canal de call apagado: limpa o registro do dono (transferência) e o resto do sistema antigo de calls temporárias.
module.exports = {
  name: "channelDelete",
  async execute(channel) {
    cancelEmptyTimer(channel.id);
    forgetOwner(channel.id);
    await clearCallState(channel.id);
    await CallRoom.deleteOne({ channelId: channel.id }).catch(() => {});
  },
};
