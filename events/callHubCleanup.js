const { forgetRoom, getRoom } = require("../utils/callHub");

// Se alguém apagar uma call automática na mão, limpa o registro dela
module.exports = {
  name: "channelDelete",
  async execute(channel) {
    if (getRoom(channel.id)) await forgetRoom(channel.id);
  },
};
