const { MessageFlags } = require("discord.js");
const { buildBadgesPanel } = require("../ui/badges");

module.exports = {
  name: "badges",
  description: "Envia o painel de badges HypeSquad.",
  usage: "badges",
  category: "Utilidade",

  async execute(message) {
    message.delete().catch(() => {});
    await message.channel.send({
      components: buildBadgesPanel(),
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
