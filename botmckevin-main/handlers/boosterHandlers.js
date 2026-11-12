const { MessageFlags } = require("discord.js");
const { buildBoosterEfemera } = require("../ui/booster");

async function handleBoosterButton(interaction) {
  if (interaction.customId !== "booster_ver") return;

  return interaction.reply({
    components: buildBoosterEfemera(),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

module.exports = { handleBoosterButton };
