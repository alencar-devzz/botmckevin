const { MessageFlags } = require("discord.js");
const { handlePortariaModal } = require("./portariaHandlers");
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

  if (customId.startsWith("port_modal:")) {
    return handlePortariaModal(interaction);
  }

  if (customId.startsWith("post_modal:")) {
    return handlePostModal(interaction);
  }

  return;
}

module.exports = { handleModal };
