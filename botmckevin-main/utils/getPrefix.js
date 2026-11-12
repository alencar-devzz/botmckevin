const { getGuildConfig } = require("../database/getGuildConfig");

const DEFAULT_PREFIX = "n!";

async function getPrefix(guildId) {
  const config = await getGuildConfig(guildId);
  return config.prefix || DEFAULT_PREFIX;
}

module.exports = { getPrefix, DEFAULT_PREFIX };
