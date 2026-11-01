const { MessageFlags } = require("discord.js");
const { getGuildConfig } = require("../database/getGuildConfig");
const { buildMainMenu } = require("../ui/mainMenu");
const { buildAparenciaPanel, buildPrefixoEfemero } = require("../ui/aparencia");
const { buildComunidadePanel } = require("../ui/comunidade");
const { buildPortariaIntro, buildPortariaConfig } = require("../ui/portaria");
const {
  buildNomeModal,
  buildAvatarModal,
  buildBannerModal,
} = require("../ui/aparenciaModals");
const { buildMensagensModal } = require("../ui/portariaModals");
const { waitingForPrefix, key } = require("./prefixWait");
const { handleTicketButton } = require("./ticketHandlers");
const { handleRegrasButton } = require("./regrasHandlers");
const { handleBoosterButton } = require("./boosterHandlers");
const { handleModerationButton } = require("./moderationHandlers");

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

  if (customId === "mod_confirm" || customId === "mod_cancel") {
    return handleModerationButton(interaction);
  }

  switch (customId) {
    case "back_main": {
      return interaction.update({ components: buildMainMenu() });
    }

    case "back_comunidade": {
      return interaction.update({ components: buildComunidadePanel() });
    }

    case "btn_nome":
      return interaction.showModal(buildNomeModal());

    case "btn_avatar":
      return interaction.showModal(buildAvatarModal());

    case "btn_banner":
      return interaction.showModal(buildBannerModal());

    case "btn_prefixo": {
      const config = await getGuildConfig(interaction.guild.id);
      await interaction.reply({
        components: buildPrefixoEfemero(config.prefix),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      // Guardamos a interaction: é ela que permite editar a mensagem efêmera depois
      waitingForPrefix.set(
        key(interaction.guild.id, interaction.user.id, interaction.channel.id),
        { interaction }
      );
      return;
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
