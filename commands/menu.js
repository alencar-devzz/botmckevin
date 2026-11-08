const { MessageFlags } = require("discord.js");
const { buildMainMenu } = require("../ui/mainMenu");
const { startMenuSession } = require("../utils/menuSession");
const { getPrefix } = require("../utils/getPrefix");

module.exports = {
  name: "menu",
  async execute(message) {
    const prefix = await getPrefix(message.guild.id);
    const sent = await message.channel.send({
      components: buildMainMenu({ guild: message.guild, client: message.client, prefix }),
      flags: MessageFlags.IsComponentsV2,
    });

    // Expira após 5 minutos sem interação
    startMenuSession(sent, prefix);
  },
};
