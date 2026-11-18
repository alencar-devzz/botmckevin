const { MessageFlags } = require("discord.js");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");
const keeper = require("../utils/callKeeper");
const {
  IDS,
  buildBotcallPanel,
  buildBotcallPicker,
  buildBotcallConfirm,
  buildBotcallNotice,
} = require("../ui/botcall");

const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL = MessageFlags.Ephemeral;

const isStaff = (interaction) => Boolean(interaction.member?.roles?.cache?.hasAny(...ALL_STAFF_ROLE_IDS));

// Aviso em efêmera
const notice = (text) => ({ components: buildBotcallNotice(text), flags: V2 | EPHEMERAL });

function errorText(err, channelId) {
  switch (err?.code) {
    case "invalid_channel":
      return "Essa call não existe mais. Selecione outra call.";
    case "not_joinable":
      return (
        `Não consigo entrar em <#${channelId}>. ` +
        "Confira se eu tenho as permissões **Ver canal** e **Conectar** e se a call não está lotada."
      );
    default:
      return `Não consegui conectar em <#${channelId}>. Tente novamente em instantes.`;
  }
}

// Conecta o bot na call (o keeper salva no MongoDB e passa a mantê-la).
// Retorna true se conectou; senão avisa em efêmera e retorna false.
async function tryJoin(interaction, channelId) {
  const guild = interaction.guild;
  const channel = guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));

  try {
    await keeper.joinCall(channel);
    return true;
  } catch (err) {
    if (err?.code === "invalid_channel") {
      // Se a call apagada é a que o bot mantém, libera a seleção para o painel voltar a mostrar o select.
      // (Se foi só uma escolha de outra call que sumiu, a call atual do bot não é mexida.)
      if (keeper.getSelectedChannel(guild.id) === channelId) {
        await keeper.stopCall(guild.id, "channel_deleted", { clearChannel: true }).catch(() => {});
      }
    } else if (!(err instanceof keeper.CallError)) {
      console.error("[BOTCALL] Erro ao conectar:", err);
    } else if (err.code === "connect_failed") {
      console.error("[BOTCALL] Não consegui conectar:", err.message);
    }
    await interaction.followUp(notice(errorText(err, channelId))).catch(() => {});
    return false;
  }
}

// Redesenha o painel em que a pessoa clicou com o estado real do bot
async function renderPanel(interaction) {
  const view = keeper.getCallView(interaction.guild.id);
  await interaction.editReply({ components: buildBotcallPanel(view), flags: V2 });
  keeper.markPanelRendered(interaction.guild.id, interaction.message.id, view);
}

// O painel usado agora passa a ser atualizado em tempo real
const trackPanel = (interaction, messageId) =>
  keeper.registerPanel(interaction.guild.id, interaction.channelId, messageId, { refresh: false });

async function handleBotcallSelect(interaction) {
  if (!isStaff(interaction)) {
    return interaction.reply(notice("Você não tem permissão para usar este painel."));
  }

  const { customId } = interaction;
  const channelId = interaction.values[0];

  // Select do próprio painel (ainda sem call): conecta e atualiza o painel
  if (customId === IDS.selectInitial) {
    await interaction.deferUpdate();
    trackPanel(interaction, interaction.message.id);
    await tryJoin(interaction, channelId);
    return renderPanel(interaction);
  }

  // Select da efêmera (botão Selecionar): conecta, atualiza o painel e confirma na efêmera
  if (customId.startsWith(`${IDS.pick}:`)) {
    const panelMessageId = customId.split(":")[1];
    await interaction.deferUpdate();
    trackPanel(interaction, panelMessageId);
    if (!(await tryJoin(interaction, channelId))) return;

    await keeper.refreshPanels(interaction.guild.id, { force: true });
    return interaction.editReply({ components: buildBotcallConfirm(channelId), flags: V2 });
  }
}

async function handleBotcallButton(interaction) {
  if (!isStaff(interaction)) {
    return interaction.reply(notice("Você não tem permissão para usar este painel."));
  }

  // Painéis antigos tinham o id da call depois dos dois pontos (botcall_connect:123); hoje o estado vem do keeper
  const [action, legacyChannelId] = interaction.customId.split(":");
  const guildId = interaction.guild.id;

  switch (action) {
    case IDS.choose:
      trackPanel(interaction, interaction.message.id);
      return interaction.reply({
        components: buildBotcallPicker(interaction.message.id),
        flags: V2 | EPHEMERAL,
      });

    case IDS.disconnect:
      await interaction.deferUpdate();
      trackPanel(interaction, interaction.message.id);
      // Desconexão de propósito: o bot sai e NÃO volta sozinho
      await keeper.stopCall(guildId, "button");
      return renderPanel(interaction);

    case IDS.connect: {
      await interaction.deferUpdate();
      trackPanel(interaction, interaction.message.id);

      const channelId = keeper.getSelectedChannel(guildId) ?? legacyChannelId;
      if (!channelId) {
        await interaction.followUp(notice("Selecione uma call primeiro.")).catch(() => {});
        return renderPanel(interaction);
      }

      await tryJoin(interaction, channelId);
      return renderPanel(interaction);
    }

    default:
      return;
  }
}

module.exports = { handleBotcallButton, handleBotcallSelect };
