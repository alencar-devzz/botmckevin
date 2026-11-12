const GuildConfig = require("./models/GuildConfig");

async function getGuildConfig(guildId) {
  let config = await GuildConfig.findOne({ guildId });
  if (!config) {
    config = await GuildConfig.create({ guildId });
  }
  return config;
}

module.exports = { getGuildConfig };
