const { getGuildConfig } = require("../database/getGuildConfig");
const { sendGreeting } = require("../utils/portaria");
const { wasBlocked } = require("../utils/antiraid/joinGate");

module.exports = {
  name: "guildMemberRemove",
  async execute(member) {
    if (member.user?.bot) return;
    if (wasBlocked(member.guild.id, member.id)) return; // barrado pelo Anti-Raid: sem mensagem de saída
    const config = await getGuildConfig(member.guild.id);
    await sendGreeting("leave", member, config);
  },
};
