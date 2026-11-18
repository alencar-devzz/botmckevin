const { MessageFlags } = require("discord.js");
const { buildMainMenu } = require("../ui/mainMenu");
const { getPrefix } = require("../utils/getPrefix");
const { openSearchModal } = require("./menuSearchHandlers");
const { rememberCategoryPage, recallCategoryPage } = require("../utils/menuSession");
const { buildComunidadePanel } = require("../ui/comunidade");
const { buildModeracaoPanel } = require("../ui/moderacao");
const { buildOutrosPanel } = require("../ui/outros");
const { buildSistemasPanel } = require("../ui/sistemas");
const { buildMessageHome } = require("../ui/mensagemPanels");
const { handlePortariaButton } = require("./portariaHandlers");
const { handleAparenciaButton } = require("./aparenciaHandlers");
const { handleLogsButton } = require("./logsHandlers");
const { handlePostsConfigButton, handlePostButton } = require("./postsHandlers");
const { handleTicketButton } = require("./ticketHandlers");
const { handleRegrasButton } = require("./regrasHandlers");
const { handleBoosterButton } = require("./boosterHandlers");
const { handleModerationButton } = require("./moderationHandlers");
const { handleBotcallButton } = require("./botcallHandlers");
const { handleHelpButton } = require("./helpHandlers");
const { handleTicketConfigButton } = require("./ticketConfigHandlers");
const { handleClConfigButton } = require("./clHandlers");
const { handleSpotifyConfigButton } = require("./spotifyConfigHandlers");
const { handleNukeConfigButton } = require("./nukeHandlers");
const { handleRoleManageButton, handleRoleManageConfigButton } = require("./roleManageHandlers");
const { handleBumpButton } = require("./bumpHandlers");
const { handleAntiRaidButton } = require("./antiRaidHandlers");
const { handleMessageButton } = require("./mensagemHandlers");
const { handleMetricsButton } = require("./metricasHandlers");
const { handleSpotifyButton } = require("./spotifyHandlers");
const { handleTagButton } = require("./tagHandlers");
const { handleDupButton } = require("./dupCategoriaHandlers");
const { handleEmojiButton } = require("./addEmojiHandlers");
const { handleSorteioButton } = require("./sorteioHandlers");
const { handleInvitesConfigButton } = require("./convitesConfigHandlers");
const { handleUnbanallButton } = require("./unbanallHandlers");

const {
  handleCallHubConfigButton,
  handleCallPanelButton,
} = require("./callHubHandlers");

async function handleButton(interaction) {
  const { customId } = interaction;

  // Central de ajuda (comando /help)
  if (customId.startsWith("help:")) {
    return handleHelpButton(interaction);
  }

  // Painel do comando /sorteio e botões dos sorteios publicados
  if (customId.startsWith("sr:")) {
    return handleSorteioButton(interaction);
  }

  // Painel do comando unbanall (desbanimento em massa)
  if (customId.startsWith("uba:")) {
    return handleUnbanallButton(interaction);
  }

  // Painel do comando /duplicar-categoria
  if (customId.startsWith("dup:")) {
    return handleDupButton(interaction);
  }

  // Painel do comando /addemoji
  if (customId.startsWith("emj:")) {
    return handleEmojiButton(interaction);
  }

  // Painel do comando tag (cada botão entrega um cargo)
  if (customId.startsWith("tag:")) {
    return handleTagButton(interaction);
  }

  // Card do comando spotify
  if (customId.startsWith("spt:")) {
    return handleSpotifyButton(interaction);
  }

  // Painel do comando metricas
  if (customId.startsWith("met:")) {
    return handleMetricsButton(interaction);
  }

  // Painel do Anti-Raid (comando painelps)
  if (customId.startsWith("ar:")) {
    return handleAntiRaidButton(interaction);
  }

  // Criador de mensagens (comando mensagem), inclusive os botões decorativos das mensagens publicadas
  if (customId.startsWith("msg:")) {
    return handleMessageButton(interaction);
  }

  // Calls temporárias: configuração no /menu e botões do painel da call
  if (customId.startsWith("chcfg_")) {
    return handleCallHubConfigButton(interaction);
  }

  if (customId.startsWith("cpn_")) {
    return handleCallPanelButton(interaction);
  }

  // Painel do comando groles e a configuração dele no /menu
  if (customId.startsWith("grl:")) {
    return handleRoleManageButton(interaction);
  }

  if (customId.startsWith("rmcfg_")) {
    return handleRoleManageConfigButton(interaction);
  }

  // Bump reminder (/menu > Moderação)
  if (customId.startsWith("bumpcfg_")) {
    return handleBumpButton(interaction);
  }

  // Configuração do comando cl no /menu
  if (customId.startsWith("clcfg_")) {
    return handleClConfigButton(interaction);
  }

  // Configuração do comando /convites no /menu
  if (customId.startsWith("invcfg_")) {
    return handleInvitesConfigButton(interaction);
  }

  // Configuração do comando spotify no /menu
  if (customId.startsWith("sptcfg_")) {
    return handleSpotifyConfigButton(interaction);
  }

  // Configuração do comando nnuke no /menu
  if (customId.startsWith("nukecfg_")) {
    return handleNukeConfigButton(interaction);
  }

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

  if (customId.startsWith("port_")) {
    return handlePortariaButton(interaction);
  }

  if (customId.startsWith("logs_")) {
    return handleLogsButton(interaction);
  }

  if (customId.startsWith("pcfg_")) {
    return handlePostsConfigButton(interaction);
  }

  if (customId.startsWith("post_")) {
    return handlePostButton(interaction);
  }

  if (customId === "mod_confirm" || customId === "mod_cancel") {
    return handleModerationButton(interaction);
  }

  // /menu: botões do menu principal (Sistemas / Outros)
  if (customId.startsWith("main_btn:")) {
    const btn = customId.split(":")[1];
    if (btn === "sistemas") {
      return interaction.update({ components: buildSistemasPanel() });
    }
    if (btn === "outros") {
      return interaction.update({ components: buildOutrosPanel() });
    }
    // Compatibilidade: atalhos diretos ainda usados pela busca (aparencia, comunidade, moderacao)
    const { openMainOption } = require("./selectHandlers");
    return openMainOption(interaction, btn);
  }

  // /menu: lista de sistemas de uma categoria (cat:<categoria>:<ação>:<valor>)
  if (customId.startsWith("cat:")) {
    const [, group, action, arg] = customId.split(":");
    const selects = require("./selectHandlers");
    const messageId = interaction.message?.id;

    // Categoria "outros" — abre diretamente o sistema correspondente
    if (group === "outros") {
      if (action === "open") {
        return selects.openOutrosOption(interaction, arg);
      }
      return;
    }

    // Categoria "sistemas" — abre o painel do sistema principal (aparencia/comunidade/moderacao)
    if (group === "sistemas") {
      if (action === "open") {
        return selects.openMainOption(interaction, arg);
      }
      return;
    }

    if (action === "prev" || action === "next") {
      const page = Math.max(0, Number(arg) || 0);
      rememberCategoryPage(messageId, group, page);
      const build = group === "moderacao" ? buildModeracaoPanel : buildComunidadePanel;
      return interaction.update({ components: build(page) });
    }

    if (action === "open") {
      const options = group === "moderacao" ? require("../ui/moderacao").MODERACAO_OPCOES : require("../ui/comunidade").COMUNIDADE_OPCOES;
      const { PAGE_SIZE } = require("../ui/categoryPanel");
      rememberCategoryPage(messageId, group, Math.floor(Math.max(0, options.findIndex((o) => o.value === arg)) / PAGE_SIZE));
      return group === "moderacao"
        ? selects.openModeracaoOption(interaction, arg)
        : selects.openComunidadeOption(interaction, arg);
    }
    return; // "idx" (indicador de página) está sempre desativado
  }

  switch (customId) {
    case "menu_search": {
      return openSearchModal(interaction);
    }

    case "back_main": {
      // Volta para o painel principal completo (com as informações e o botão Buscar)
      const prefix = await getPrefix(interaction.guild.id);
      return interaction.update({
        components: buildMainMenu({ guild: interaction.guild, client: interaction.client, prefix }),
      });
    }

    case "back_moderacao": {
      return interaction.update({ components: buildModeracaoPanel(recallCategoryPage(interaction.message?.id, "moderacao")) });
    }

    case "back_comunidade": {
      return interaction.update({ components: buildComunidadePanel(recallCategoryPage(interaction.message?.id, "comunidade")) });
    }

    case "back_outros": {
      return interaction.update({ components: buildOutrosPanel() });
    }

    default:
      return;
  }
}

module.exports = { handleButton };
