const { MessageFlags } = require("discord.js");
const { buildRegrasEfemera, buildTermosEfemera } = require("../ui/regras");

async function handleRegrasButton(interaction) {
  const flags = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

  switch (interaction.customId) {
    case "regras_ver":
      return interaction.reply({ components: buildRegrasEfemera(), flags });

    case "regras_termos":
      return interaction.reply({ components: buildTermosEfemera(), flags });

    default:
      return;
  }
}

module.exports = { handleRegrasButton };
