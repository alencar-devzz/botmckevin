const { MessageFlags } = require("discord.js");
const { getGuildConfig } = require("../database/getGuildConfig");
const { buildAparenciaPanel } = require("../ui/aparencia");
const { buildComunidadePanel } = require("../ui/comunidade");
const { buildPortariaIntro, buildPortariaConfig } = require("../ui/portaria");
const { buildAutoRolesPanel } = require("../ui/autoroles");
const { handleTicketSelect } = require("./ticketHandlers");
const { handleBotcallSelect } = require("./botcallHandlers");

async function handleSelect(interaction) {
  const { customId, values } = interaction;

  if (customId.startsWith("botcall_")) {
    return handleBotcallSelect(interaction);
  }

  switch (customId) {
    case "main_menu": {
      const value = values[0];
      if (value === "aparencia") {
        return interaction.reply({
          components: buildAparenciaPanel(),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
      }
      if (value === "comunidade") {
        return interaction.reply({
          components: buildComunidadePanel(),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
      }
      return;
    }

    case "comunidade_menu": {
      const value = values[0];
      if (value === "portaria") {
        return interaction.update({ components: buildPortariaIntro() });
      }
      if (value === "autoroles") {
        const config = await getGuildConfig(interaction.guild.id);
        return interaction.update({ components: buildAutoRolesPanel(config) });
      }
      return;
    }

    case "portaria_welcome_channel": {
      const config = await getGuildConfig(interaction.guild.id);
      config.welcomeChannel = values[0];
      await config.save();
      return interaction.update({ components: buildPortariaConfig(config) });
    }

    case "portaria_leave_channel": {
      const config = await getGuildConfig(interaction.guild.id);
      config.leaveChannel = values[0];
      await config.save();
      return interaction.update({ components: buildPortariaConfig(config) });
    }

    case "autoroles_select": {
      const config = await getGuildConfig(interaction.guild.id);
      config.autoRoles = values; // até 5 ids de cargo
      await config.save();
      return interaction.update({ components: buildAutoRolesPanel(config) });
    }

    case "ticket_select":
      return handleTicketSelect(interaction);

    default:
      return;
  }
}

module.exports = { handleSelect };
