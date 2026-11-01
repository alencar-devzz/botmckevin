const { MessageFlags } = require("discord.js");
const {
  joinVoiceChannel,
  getVoiceConnection,
  entersState,
  VoiceConnectionStatus,
} = require("@discordjs/voice");
const { STAFF_ROLE_IDS } = require("../utils/ticketConfig");
const {
  buildBotcallPanel,
  buildBotcallSelectEfemera,
  buildBotcallConfirmEfemera,
} = require("../ui/botcall");

const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL = MessageFlags.Ephemeral;

function isStaff(interaction) {
  return interaction.member?.roles?.cache?.hasAny(...STAFF_ROLE_IDS);
}

// Entra na call (trocando de call se o bot já estiver em outra) e espera ficar pronto
async function connectToChannel(channel) {
  getVoiceConnection(channel.guild.id)?.destroy();

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: true,
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  } catch (err) {
    connection.destroy();
    throw err;
  }

  // Se o bot for desconectado/movido por fora, tenta reconectar; se não der, limpa a conexão
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
        connection.destroy();
      }
    }
  });

  return connection;
}

// Valida a call e conecta. Retorna true se conectou; senão avisa em efêmera e retorna false.
async function tryConnect(interaction, channel) {
  if (!channel || !channel.isVoiceBased()) {
    await interaction.followUp({ content: "Essa call não existe mais.", flags: EPHEMERAL });
    return false;
  }
  if (!channel.joinable) {
    await interaction.followUp({
      content: "Não consigo entrar nessa call (sem permissão ou call lotada).",
      flags: EPHEMERAL,
    });
    return false;
  }
  try {
    await connectToChannel(channel);
    return true;
  } catch (err) {
    console.error("[BOTCALL] Erro ao conectar:", err);
    await interaction.followUp({
      content: "Não consegui conectar nessa call. Tente novamente.",
      flags: EPHEMERAL,
    });
    return false;
  }
}

function semPermissao(interaction) {
  return interaction.reply({
    content: "Você não tem permissão para usar esse painel.",
    flags: EPHEMERAL,
  });
}

async function handleBotcallSelect(interaction) {
  if (!isStaff(interaction)) return semPermissao(interaction);

  const channel = interaction.guild.channels.cache.get(interaction.values[0]);
  await interaction.deferUpdate();

  // Select do próprio painel: conecta e atualiza o painel
  if (interaction.customId === "botcall_select_initial") {
    if (!(await tryConnect(interaction, channel))) return;
    return interaction.editReply({
      components: buildBotcallPanel({ selectedId: channel.id, connected: true }),
      flags: V2,
    });
  }

  // Select da efêmera (botão "Selecionar"): conecta, atualiza o painel e a efêmera
  if (interaction.customId.startsWith("botcall_pick:")) {
    const panelMessageId = interaction.customId.split(":")[1];
    if (!(await tryConnect(interaction, channel))) return;

    const panel = await interaction.channel?.messages.fetch(panelMessageId).catch(() => null);
    await panel
      ?.edit({
        components: buildBotcallPanel({ selectedId: channel.id, connected: true }),
        flags: V2,
      })
      .catch((err) => console.error("[BOTCALL] Erro ao atualizar painel:", err.message));

    return interaction.editReply({
      components: buildBotcallConfirmEfemera(channel.id),
      flags: V2,
    });
  }
}

async function handleBotcallButton(interaction) {
  if (!isStaff(interaction)) return semPermissao(interaction);

  const [action, channelId] = interaction.customId.split(":");

  switch (action) {
    case "botcall_choose":
      return interaction.reply({
        components: buildBotcallSelectEfemera(interaction.message.id),
        flags: V2 | EPHEMERAL,
      });

    case "botcall_disconnect":
      getVoiceConnection(interaction.guild.id)?.destroy();
      return interaction.update({
        components: buildBotcallPanel({ selectedId: channelId, connected: false }),
      });

    case "botcall_connect": {
      await interaction.deferUpdate();
      const channel = interaction.guild.channels.cache.get(channelId);
      if (!(await tryConnect(interaction, channel))) return;
      return interaction.editReply({
        components: buildBotcallPanel({ selectedId: channelId, connected: true }),
        flags: V2,
      });
    }

    default:
      return;
  }
}

module.exports = { handleBotcallButton, handleBotcallSelect };
