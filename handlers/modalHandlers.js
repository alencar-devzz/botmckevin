const { MessageFlags } = require("discord.js");
const { handlePortariaModal } = require("./portariaHandlers");
const { handleTicketConfigModal } = require("./ticketConfigHandlers");
const { handleAparenciaModal } = require("./aparenciaHandlers");
const { handleTicketModal } = require("./ticketHandlers");
const { handlePostModal, handlePostsConfigModal } = require("./postsHandlers");
const { handleClConfigModal } = require("./clHandlers");
const { handleSpotifyConfigModal } = require("./spotifyConfigHandlers");
const { handleNukeConfigModal } = require("./nukeHandlers");
const { handleRoleManageModal, handleRoleManageConfigModal } = require("./roleManageHandlers");
const { handleBumpModal } = require("./bumpHandlers");
const { handleAntiLinkModal } = require("./antiLinkHandlers");
const { handleMessageModal } = require("./mensagemHandlers");

const { handleCallHubConfigModal, handleCallPanelModal } = require("./callHubHandlers");

async function handleModal(interaction) {
  const { customId } = interaction;

  // Anti-link (listas de domínios, servidores parceiros e mensagem do aviso)
  if (customId.startsWith("ar:al:modal:")) {
    return handleAntiLinkModal(interaction);
  }

  // Criador de mensagens (comando mensagem)
  if (customId.startsWith("msg:modal:")) {
    return handleMessageModal(interaction);
  }

  if (customId.startsWith("chcfg_modal:")) {
    return handleCallHubConfigModal(interaction);
  }

  if (customId.startsWith("cpn_modal:")) {
    return handleCallPanelModal(interaction);
  }

  if (customId.startsWith("grl_modal:")) {
    return handleRoleManageModal(interaction);
  }

  if (customId.startsWith("rmcfg_modal:")) {
    return handleRoleManageConfigModal(interaction);
  }

  if (customId.startsWith("bumpcfg_modal:")) {
    return handleBumpModal(interaction);
  }

  if (customId.startsWith("clcfg_modal:")) {
    return handleClConfigModal(interaction);
  }

  if (customId.startsWith("sptcfg_modal:")) {
    return handleSpotifyConfigModal(interaction);
  }

  if (customId.startsWith("nukecfg_modal:")) {
    return handleNukeConfigModal(interaction);
  }

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
