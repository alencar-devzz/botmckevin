const { MessageFlags } = require("discord.js");
const { getGuildConfig } = require("../database/getGuildConfig");
const { buildPortariaConfig } = require("../ui/portaria");
const { handleTicketConfigModal } = require("./ticketConfigHandlers");
const { handleAparenciaModal } = require("./aparenciaHandlers");
const { handleTicketModal } = require("./ticketHandlers");
const { handlePostModal, handlePostsConfigModal } = require("./postsHandlers");

async function handleModal(interaction) {
  const { customId } = interaction;

  if (customId.startsWith("tcfg_modal_")) {
    return handleTicketConfigModal(interaction);
  }

  if (customId.startsWith("apar_modal_")) {
    return handleAparenciaModal(interaction);
  }

  if (customId.startsWith("ticket_reason:")) {
    return handleTicketModal(interaction);
  }

  if (customId.startsWith("pcfg_modal:")) {
    return handlePostsConfigModal(interaction);
  }

  if (customId.startsWith("post_modal:")) {
    return handlePostModal(interaction);
  }

  switch (customId) {
    case "modal_mensagens": {
      const welcome = interaction.fields.getTextInputValue("welcome_message");
      const leave = interaction.fields.getTextInputValue("leave_message");

      const config = await getGuildConfig(interaction.guild.id);
      config.welcomeMessage = welcome || null;
      config.leaveMessage = leave || null;
      await config.save();

      return interaction.update({ components: buildPortariaConfig(config) });
    }

    default:
      return;
  }
}

module.exports = { handleModal };
