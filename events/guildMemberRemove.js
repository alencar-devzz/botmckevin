const { getGuildConfig } = require("../database/getGuildConfig");
const { sendGreeting } = require("../utils/portaria");

module.exports = {
  name: "guildMemberRemove",
  async execute(member) {
    if (member.user?.bot) return;
    const config = await getGuildConfig(member.guild.id);
    await sendGreeting("leave", member, config);
  },
};
