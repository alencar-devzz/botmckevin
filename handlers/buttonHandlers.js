const { MessageFlags } = require("discord.js");
const { getGuildConfig } = require("../database/getGuildConfig");
const { buildMainMenu } = require("../ui/mainMenu");
const { buildComunidadePanel } = require("../ui/comunidade");
const { buildModeracaoPanel } = require("../ui/moderacao");
const { buildPortariaIntro, buildPortariaConfig } = require("../ui/portaria");
const { buildMensagensModal } = require("../ui/portariaModals");
const { handleAparenciaButton } = require("./aparenciaHandlers");
const { handleLogsButton } = require("./logsHandlers");
const { handleTicketButton } = require("./ticketHandlers");
const { handleRegrasButton } = require("./regrasHandlers");
const { handleBoosterButton } = require("./boosterHandlers");
const { handleModerationButton } = require("./moderationHandlers");
const { handleBotcallButton } = require("./botcallHandlers");
const { handleTicketConfigButton } = require("./ticketConfigHandlers");

async function handleButton(interaction) {
  const { customId } = interaction;

  if (customId.startsWith("ticket_")) {
    return handleTicketButton(interaction);
  }

  if (customId.startsWith("regras_")) {
    return handleRegrasButton(interaction);
  }

  if (customId.startsWith("booster_")) {
    return handleBoosterButton(interaction);
  }

  if (customId.startsWith("botcall_")) {
    return handleBotcallButton(interaction);
  }

  if (customId.startsWith("tcfg_")) {
    return handleTicketConfigButton(interaction);
  }

  if (customId.startsWith("apar_")) {
    return handleAparenciaButton(interaction);
  }

  if (customId.startsWith("logs_")) {
    return handleLogsButton(interaction);
  }

  if (customId === "mod_confirm" || customId === "mod_cancel") {
    return handleModerationButton(interaction);
  }

  switch (customId) {
    case "back_main": {
      return interaction.update({ components: buildMainMenu() });
    }

    case "back_moderacao": {
      return interaction.update({ components: buildModeracaoPanel() });
    }

    case "back_comunidade": {
      return interaction.update({ components: buildComunidadePanel() });
    }

    case "btn_portaria_abrir": {
      const config = await getGuildConfig(interaction.guild.id);
      return interaction.update({ components: buildPortariaConfig(config) });
    }

    case "btn_portaria_mensagens": {
      const config = await getGuildConfig(interaction.guild.id);
      return interaction.showModal(buildMensagensModal(config));
    }

    default:
      return;
  }
}

module.exports = { handleButton };
