const CallRoom = require("../database/models/CallRoom");
const { forgetOwner } = require("../utils/callHub");

// Canal de call apagado: limpa o registro do dono (transferência) e o resto do sistema antigo de calls temporárias.
module.exports = {
  name: "channelDelete",
  async execute(channel) {
    forgetOwner(channel.id);
    await CallRoom.deleteOne({ channelId: channel.id }).catch(() => {});
  },
};
