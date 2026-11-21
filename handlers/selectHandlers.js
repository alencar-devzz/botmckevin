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
const { handleUnbanallSelect } = require("./unbanallHandlers");
const { handleSorteioSelect, openSorteioMenu } = require("./sorteioHandlers");
const {
  openInvitesConfigPanel,
  handleInvitesConfigSelect,
} = require("./convitesConfigHandlers");
const { handleTicketConfigSelect, openTicketHome } = require("./ticketConfigHandlers");
const { buildModeracaoPanel } = require("../ui/moderacao");
const { buildSelfPanel } = require("../ui/self");
const { openLogsPanel, handleLogsSelect } = require("./logsHandlers");
const { openPostsPanel, handlePostsConfigSelect, handlePostSelect } = require("./postsHandlers");
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
const { buildOutrosPanel } = require("../ui/outros");
const { buildSistemasPanel } = require("../ui/sistemas");
const { buildMessageHome } = require("../ui/mensagemPanels");

// Abre uma opção do menu principal. Usado pelo resultado da busca e pelos botões cat:sistemas:open:*.
async function openMainOption(interaction, value) {
  // Se já estamos numa mensagem efêmera (o /menu é efêmero), edita no lugar.
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
  if (value === "self") {
    return respond(buildSelfPanel());
  }
}

// Opções da categoria Moderação (busca e cat:moderacao:open:*)
async function openModeracaoOption(interaction, value) {
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
}

// Opções da categoria Self (busca e cat:self:open:*). Ainda sem sistemas.
const {
  handleBioPanelButton: _bpBtn,
  handleBioPanelModal: _bpMdl,
} = require("./bioPanelHandlers");
const { getPanels, getToken } = require("../utils/bioPanel/store");
const { buildBioPanelHome } = require("../ui/bioPanel/bioPanelConfig");

async function openSelfOption(interaction, value) {
  if (value === "bio_panel") {
    const { guildId } = interaction;
    const [panels, hasToken] = await Promise.all([
      getPanels(guildId),
      getToken(guildId).then((t) => t !== null),
    ]);
    return interaction.update({
      components: buildBioPanelHome(panels, hasToken),
      flags: require("discord.js").MessageFlags.IsComponentsV2,
    });
  }
}

// Opções da categoria Comunidade e interação (busca e cat:comunidade:open:*)
async function openComunidadeOption(interaction, value) {
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
}

// Opções da categoria Outros (busca e cat:outros:open:*)
async function openOutrosOption(interaction, value) {
  if (value === "msg") {
    return require("./mensagemHandlers").showMenuHome(interaction);
  }
  if (value === "sorteios") {
    return openSorteioMenu(interaction);
  }
}

// Abre um sistema pela chave "grupo:valor" (ex.: "moderacao:tickets"). Usado pelo resultado da busca
// e pela busca que leva direto ao sistema.
async function openSystem(interaction, key) {
  const [group, value] = String(key).split(":");
  if (group === "main") return openMainOption(interaction, value);
  if (group === "sistemas") return openMainOption(interaction, value);
  if (group === "moderacao") return openModeracaoOption(interaction, value);
  if (group === "comunidade") return openComunidadeOption(interaction, value);
  if (group === "self") return openSelfOption(interaction, value);
  if (group === "outros") return openOutrosOption(interaction, value);
}

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

  // Painel do comando unbanall
  if (customId.startsWith("uba:")) {
    return handleUnbanallSelect(interaction);
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

  // Calls temporárias: configuração no /menu e seletores do painel da call
  if (customId.startsWith("chcfg_")) {
    return handleCallHubConfigSelect(interaction);
  }

  if (customId.startsWith("cpn_")) {
    return handleCallPanelSelect(interaction);
  }

  // Painel do comando groles e a configuração dele no /menu
  if (customId.startsWith("grl:")) {
    return handleRoleManageSelect(interaction);
  }

  if (customId.startsWith("rmcfg_")) {
    return handleRoleManageConfigSelect(interaction);
  }

  // Bump reminder (/menu > Moderação)
  if (customId.startsWith("bumpcfg_")) {
    return handleBumpSelect(interaction);
  }

  // Configuração do comando /convites no /menu
  if (customId.startsWith("invcfg_")) {
    return handleInvitesConfigSelect(interaction);
  }

  // Configuração do comando cl no /menu
  if (customId.startsWith("clcfg_")) {
    return handleClConfigSelect(interaction);
  }

  // Configuração do comando spotify no /menu
  if (customId.startsWith("sptcfg_")) {
    return handleSpotifyConfigSelect(interaction);
  }

  // Configuração do comando nnuke no /menu
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

  if (customId.startsWith("post_")) {
    return handlePostSelect(interaction);
  }

  switch (customId) {
    // Resultado da busca do /menu: o valor é "grupo:sistema" (ex.: "comunidade:portaria")
    case "menu_search_pick": {
      return openSystem(interaction, values[0]);
    }

    case "moderacao_menu": {
      return openModeracaoOption(interaction, values[0]);
    }

    case "comunidade_menu": {
      return openComunidadeOption(interaction, values[0]);
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

module.exports = { handleSelect, openSystem, openMainOption, openModeracaoOption, openSelfOption, openComunidadeOption, openOutrosOption };
