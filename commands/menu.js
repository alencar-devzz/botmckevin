const { MessageFlags } = require("discord.js");
const { buildMainMenu } = require("../ui/mainMenu");
const { startMenuSession } = require("../utils/menuSession");
const { getPrefix } = require("../utils/getPrefix");

module.exports = {
  name: "menu",
  aliases: ["painel"], // n!painel abre o mesmo painel principal de configurações
  async execute(message) {
    const sent = await message.channel.send({
      components: buildMainMenu(),
      flags: MessageFlags.IsComponentsV2,
    });

    // Expira após 5 minutos sem interação
    startMenuSession(sent, await getPrefix(message.guild.id));
  },
};
