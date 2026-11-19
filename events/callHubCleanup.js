const CallRoom = require("../database/models/CallRoom");

// Resto do sistema antigo de calls temporárias: se um canal que ainda estava registrado for apagado,
// o registro some do banco. (O gerenciador de calls novo não usa mais esse registro.)
module.exports = {
  name: "channelDelete",
  async execute(channel) {
    await CallRoom.deleteOne({ channelId: channel.id }).catch(() => {});
  },
};
