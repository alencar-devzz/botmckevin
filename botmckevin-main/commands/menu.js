const { MessageFlags } = require("discord.js");
const { buildMainMenu } = require("../ui/mainMenu");
const { startMenuSession } = require("../utils/menuSession");
const { getPrefix } = require("../utils/getPrefix");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");

module.exports = {
  name: "menu",
  async execute(message) {
    // Só quem tem um dos cargos de utils/staffRoles.js pode abrir o menu
    if (!message.member?.roles?.cache?.hasAny(...ALL_STAFF_ROLE_IDS)) {
      const sent = await message.channel
        .send({ content: `${message.author}, você não tem permissão para usar este comando.`, allowedMentions: { parse: [] } })
        .catch(() => null);
      setTimeout(() => sent?.delete().catch(() => {}), 8000);
      return;
    }

    const prefix = await getPrefix(message.guild.id);
    const sent = await message.channel.send({
      components: buildMainMenu({ guild: message.guild, client: message.client, prefix }),
      flags: MessageFlags.IsComponentsV2,
    });

    // Expira após 5 minutos sem interação
    startMenuSession(sent, prefix);
  },
};
