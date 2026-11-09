const { track } = require("../utils/antiraid/engine");

// Eventos do núcleo do Anti-Raid. O index.js aceita uma lista de eventos por arquivo.
const wrap = (name, run) => ({
  name,
  async execute(...args) {
    try {
      await run(...args);
    } catch (err) {
      console.error(`[ANTIRAID] Erro no evento "${name}":`, err);
    }
  },
});

module.exports = [
  wrap("channelDelete", (channel) => channel.guild && track(channel.guild, "channelDelete", channel.id)),
  wrap("channelCreate", (channel) => channel.guild && track(channel.guild, "channelCreate", channel.id)),
  wrap("roleDelete", (role) => track(role.guild, "roleDelete", role.id)),
  wrap("roleCreate", (role) => track(role.guild, "roleCreate", role.id)),
  wrap("guildBanAdd", (ban) => track(ban.guild, "ban", ban.user.id)),
  wrap("guildMemberRemove", (member) => track(member.guild, "kick", member.id)),
];
