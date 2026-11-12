const { MessageFlags } = require("discord.js");
const { buildMainMenu } = require("../ui/mainMenu");
const { getPrefix } = require("../utils/getPrefix");
const { buildComunidadePanel } = require("../ui/comunidade");
const { buildModeracaoPanel } = require("../ui/moderacao");
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
const { handleRoleManageButton, handleRoleManageConfigButton } = require("./roleManageHandlers");
const { handleBumpButton } = require("./bumpHandlers");
const { handleAntiRaidButton } = require("./antiRaidHandlers");
const { handleMessageButton } = require("./mensagemHandlers");
const { attachAckSafetyNet } = require("../utils/interactionAckSafetyNet");

const {
  handleCallHubConfigButton,
  handleCallPanelButton,
} = require("./callHubHandlers");

async function handleButton(interaction) {
  const { customId } = interaction;

  // Rede de segurança: dá tempo extra (bem mais que 3s) para o botão
  // responder antes de falhar. Botões que abrem modal ficam de fora disso
  // automaticamente — veja utils/interactionAckSafetyNet.js.
  attachAckSafetyNet(interaction);

  // Central de ajuda (comando /help)
  if (customId.startsWith("help:")) {
    return handleHelpButton(interaction);
  }

  // Painel do Anti-Raid (comando painelps)
  if (customId.startsWith("ar:")) {
    return handleAntiRaidButton(interaction);
  }

  // Criador de mensagens (comando mensagem), inclusive os botões decorativos das mensagens publicadas
  if (customId.startsWith("msg:")) {
    return handleMessageButton(interaction);
  }

  // Calls temporárias: configuração no n!menu e botões do painel da call
  if (customId.startsWith("chcfg_")) {
    return handleCallHubConfigButton(interaction);
  }

  if (customId.startsWith("cpn_")) {
    return handleCallPanelButton(interaction);
  }

  // Painel do comando groles e a configuração dele no n!menu
  if (customId.startsWith("grl:")) {
    return handleRoleManageButton(interaction);
  }

  if (customId.startsWith("rmcfg_")) {
    return handleRoleManageConfigButton(interaction);
  }

  // Bump reminder (n!menu > Moderação)
  if (customId.startsWith("bumpcfg_")) {
    return handleBumpButton(interaction);
  }

  // Configuração do comando cl no n!menu
  if (customId.startsWith("clcfg_")) {
    return handleClConfigButton(interaction);
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

  switch (customId) {
    case "back_main": {
      return interaction.update({
        components: buildMainMenu({
          guild: interaction.guild,
          client: interaction.client,
          prefix: await getPrefix(interaction.guildId),
        }),
      });
    }

    case "back_moderacao": {
      return interaction.update({ components: buildModeracaoPanel() });
    }

    case "back_comunidade": {
      return interaction.update({ components: buildComunidadePanel() });
    }

    default:
      return;
  }
}

module.exports = { handleButton };
