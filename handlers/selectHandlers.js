const { MessageFlags } = require("discord.js");
const { getGuildConfig } = require("../database/getGuildConfig");
const { openAparencia, handleAparenciaSelect } = require("./aparenciaHandlers");
const { buildComunidadePanel } = require("../ui/comunidade");
const { openPortaria, handlePortariaSelect } = require("./portariaHandlers");
const { buildAutoRolesPanel } = require("../ui/autoroles");
const { handleTicketSelect } = require("./ticketHandlers");
const { handleBotcallSelect } = require("./botcallHandlers");
const { handleTicketConfigSelect, openTicketHome } = require("./ticketConfigHandlers");
const { buildModeracaoPanel } = require("../ui/moderacao");
const { openLogsPanel, handleLogsSelect } = require("./logsHandlers");
const { openPostsPanel, handlePostsConfigSelect } = require("./postsHandlers");

async function handleSelect(interaction) {
  const { customId, values } = interaction;

  if (customId.startsWith("botcall_")) {
    return handleBotcallSelect(interaction);
  }

  if (customId.startsWith("tcfg_")) {
    return handleTicketConfigSelect(interaction);
  }

  // Painel público de tickets (select do painel novo ou de mensagens antigas)
  if (customId.startsWith("ticket_")) {
    return handleTicketSelect(interaction);
  }

  if (customId.startsWith("apar_")) {
    return handleAparenciaSelect(interaction);
  }

  if (customId.startsWith("port_")) {
    return handlePortariaSelect(interaction);
  }

  if (customId.startsWith("logs_")) {
    return handleLogsSelect(interaction);
  }

  if (customId.startsWith("pcfg_")) {
    return handlePostsConfigSelect(interaction);
  }

  switch (customId) {
    case "main_menu": {
      const value = values[0];
      if (value === "aparencia") {
        return openAparencia(interaction);
      }
      if (value === "comunidade") {
        return interaction.reply({
          components: buildComunidadePanel(),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
      }
      if (value === "moderacao") {
        return interaction.reply({
          components: buildModeracaoPanel(),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
      }
      return;
    }

    case "moderacao_menu": {
      const value = values[0];
      if (value === "tickets") {
        return openTicketHome(interaction);
      }
      if (value === "logs") {
        return openLogsPanel(interaction);
      }
      return;
    }

    case "comunidade_menu": {
      const value = values[0];
      if (value === "portaria") {
        return openPortaria(interaction);
      }
      if (value === "autoroles") {
        const config = await getGuildConfig(interaction.guild.id);
        return interaction.update({ components: buildAutoRolesPanel(config) });
      }
      if (value === "posts") {
        return openPostsPanel(interaction);
      }
      return;
    }

    case "autoroles_select": {
      const config = await getGuildConfig(interaction.guild.id);
      config.autoRoles = values; // até 5 ids de cargo
      await config.save();
      return interaction.update({ components: buildAutoRolesPanel(config) });
    }

    default:
      return;
  }
}

module.exports = { handleSelect };
