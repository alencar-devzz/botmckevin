const { MessageFlags } = require("discord.js");
const { getGuildConfig } = require("../database/getGuildConfig");
const { openAparencia, handleAparenciaSelect } = require("./aparenciaHandlers");
const { buildComunidadePanel } = require("../ui/comunidade");
const { openPortaria, handlePortariaSelect } = require("./portariaHandlers");
const { buildAutoRolesPanel } = require("../ui/autoroles");
const { handleTicketSelect } = require("./ticketHandlers");
const { handleBotcallSelect } = require("./botcallHandlers");
const { handleHelpSelect } = require("./helpHandlers");
const { openBumpPanel, handleBumpSelect } = require("./bumpHandlers");
const { handleAntiRaidSelect } = require("./antiRaidHandlers");
const { handleMessageSelect } = require("./mensagemHandlers");
const { handleMetricsSelect } = require("./metricasHandlers");
const { handleDupSelect } = require("./dupCategoriaHandlers");
const { handleSorteioSelect, openSorteioMenu } = require("./sorteioHandlers");
const { handleBadgesSelect } = require("./badgesHandlers");
const {
  openInvitesConfigPanel,
  handleInvitesConfigSelect,
} = require("./convitesConfigHandlers");
const { handleTicketConfigSelect, openTicketHome } = require("./ticketConfigHandlers");
const { buildModeracaoPanel } = require("../ui/moderacao");
const { openLogsPanel, handleLogsSelect } = require("./logsHandlers");
const { openPostsPanel, handlePostsConfigSelect } = require("./postsHandlers");
const { openClPanel, handleClConfigSelect } = require("./clHandlers");
const { openSpotifyPanel, handleSpotifyConfigSelect } = require("./spotifyConfigHandlers");
const { openNukePanel, handleNukeConfigSelect } = require("./nukeHandlers");
const {
  openCallHubPanel,
  handleCallHubConfigSelect,
  handleCallPanelSelect,
} = require("./callHubHandlers");
const {
  openRoleManagePanel,
  handleRoleManageSelect,
  handleRoleManageConfigSelect,
} = require("./roleManageHandlers");

async function handleSelect(interaction) {
  const { customId, values } = interaction;

  // Central de ajuda (comando /help)
  if (customId.startsWith("help:")) {
    return handleHelpSelect(interaction);
  }

  // Painel do comando metricas
  if (customId.startsWith("met:")) {
    return handleMetricsSelect(interaction);
  }

  // Painel do comando /sorteio
  if (customId.startsWith("sr:")) {
    return handleSorteioSelect(interaction);
  }

  if (interaction.customId === "badges:house") {
    return handleBadgesSelect(interaction);
  }

  // Painel do comando /duplicar-categoria
  if (customId.startsWith("dup:")) {
    return handleDupSelect(interaction);
  }

  // Painel do Anti-Raid (comando painelps)
  if (customId.startsWith("ar:")) {
    return handleAntiRaidSelect(interaction);
  }

  // Criador de mensagens (comando mensagem)
  if (customId.startsWith("msg:")) {
    return handleMessageSelect(interaction);
  }

  // Calls temporárias: configuração no n!menu e seletores do painel da call
  if (customId.startsWith("chcfg_")) {
    return handleCallHubConfigSelect(interaction);
  }

  if (customId.startsWith("cpn_")) {
    return handleCallPanelSelect(interaction);
  }

  // Painel do comando groles e a configuração dele no n!menu
  if (customId.startsWith("grl:")) {
    return handleRoleManageSelect(interaction);
  }

  if (customId.startsWith("rmcfg_")) {
    return handleRoleManageConfigSelect(interaction);
  }

  // Bump reminder (n!menu > Moderação)
  if (customId.startsWith("bumpcfg_")) {
    return handleBumpSelect(interaction);
  }

  // Configuração do comando /convites no n!menu
  if (customId.startsWith("invcfg_")) {
    return handleInvitesConfigSelect(interaction);
  }

  // Configuração do comando cl no n!menu
  if (customId.startsWith("clcfg_")) {
    return handleClConfigSelect(interaction);
  }

  // Configuração do comando spotify no n!menu
  if (customId.startsWith("sptcfg_")) {
    return handleSpotifyConfigSelect(interaction);
  }

  // Configuração do comando nnuke no n!menu
  if (customId.startsWith("nukecfg_")) {
    return handleNukeConfigSelect(interaction);
  }

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
      // Se já estamos numa mensagem efêmera (voltou e escolheu outra opção), edita no lugar.
      // Se é a primeira vez (select na mensagem pública do n!menu), abre uma mensagem nova.
      const alreadyEphemeral = Boolean(interaction.message?.flags?.has(MessageFlags.Ephemeral));
      const respond = (components) =>
        alreadyEphemeral
          ? interaction.update({ components })
          : interaction.reply({ components, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

      if (value === "aparencia") {
        return openAparencia(interaction);
      }
      if (value === "comunidade") {
        return respond(buildComunidadePanel());
      }
      if (value === "moderacao") {
        return respond(buildModeracaoPanel());
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
      if (value === "cargos") {
        return openRoleManagePanel(interaction);
      }
      if (value === "nuke") {
        return openNukePanel(interaction);
      }
      if (value === "bump") {
        return openBumpPanel(interaction);
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
      if (value === "calls") {
        return openCallHubPanel(interaction);
      }
      if (value === "cl") {
        return openClPanel(interaction);
      }
      if (value === "spotify") {
        return openSpotifyPanel(interaction);
      }
      if (value === "convites") {
        return openInvitesConfigPanel(interaction);
      }
      if (value === "sorteios") {
        return openSorteioMenu(interaction);
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
