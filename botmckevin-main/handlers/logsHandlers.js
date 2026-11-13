const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");
const { LOG_CATEGORIES } = require("../utils/logs/categories");
const {
  getCategory,
  getAllCategories,
  updateCategory,
  setAllChannels,
} = require("../utils/logs/store");
const { deliver } = require("../utils/logs/send");
const { COLORS } = require("../utils/logs/format");
const { buildLogsPanel, buildLogCategoryPanel, buildLogsAllPanel } = require("../ui/logs");

const EPHEMERAL = MessageFlags.Ephemeral;

async function guard(interaction) {
  const member = interaction.member;
  const allowed =
    member?.permissions?.has(PermissionFlagsBits.Administrator) ||
    member?.roles?.cache?.hasAny(...ALL_STAFF_ROLE_IDS);
  if (allowed) return true;

  await interaction.reply({
    content: "Você não tem permissão para configurar os logs.",
    flags: EPHEMERAL,
  });
  return false;
}

const warn = (interaction, content) =>
  interaction.followUp({ content, flags: EPHEMERAL }).catch(() => {});

async function mainPanel(guild) {
  return buildLogsPanel(guild, await getAllCategories(guild.id));
}

async function categoryPanel(guild, key) {
  return buildLogCategoryPanel(guild, key, await getCategory(guild.id, key));
}

// Abre o painel de logs (chamado pelo select "Moderação")
async function openLogsPanel(interaction) {
  if (!(await guard(interaction))) return;
  return interaction.update({ components: await mainPanel(interaction.guild) });
}

// O bot precisa conseguir ver e enviar mensagens no canal escolhido
function canSend(channel, guild) {
  return channel?.permissionsFor(guild.members.me)?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
  ]);
}

async function createLogChannel(interaction, key) {
  const { guild } = interaction;
  const me = guild.members.me;

  const overwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
    ...ALL_STAFF_ROLE_IDS.filter((id) => guild.roles.cache.has(id)).map((id) => ({
      id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
      deny: [PermissionFlagsBits.SendMessages],
    })),
  ];

  return guild.channels.create({
    name: `logs-${LOG_CATEGORIES[key].slug}`,
    type: ChannelType.GuildText,
    parent: interaction.channel?.parentId ?? undefined,
    permissionOverwrites: overwrites,
    reason: `Canal de logs (${LOG_CATEGORIES[key].label}) criado por ${interaction.user.tag}`,
  });
}

// ---------- botões ----------

async function handleLogsButton(interaction) {
  if (!(await guard(interaction))) return;
  const [action, key] = interaction.customId.split(":");
  const { guild } = interaction;

  if (key && !LOG_CATEGORIES[key]) return;

  switch (action) {
    case "logs_back":
      return interaction.update({ components: await mainPanel(guild) });

    case "logs_all":
      return interaction.update({ components: buildLogsAllPanel(guild) });

    case "logs_toggle": {
      const cfg = await getCategory(guild.id, key);
      await updateCategory(guild.id, key, { enabled: !cfg.enabled });
      return interaction.update({ components: await categoryPanel(guild, key) });
    }

    case "logs_bots": {
      const cfg = await getCategory(guild.id, key);
      await updateCategory(guild.id, key, { ignoreBots: !cfg.ignoreBots });
      return interaction.update({ components: await categoryPanel(guild, key) });
    }

    case "logs_clear": {
      await updateCategory(guild.id, key, { channelId: null });
      return interaction.update({ components: await categoryPanel(guild, key) });
    }

    case "logs_test": {
      await interaction.deferUpdate();
      const cfg = await getCategory(guild.id, key);
      const sent = await deliver(guild, cfg, {
        title: `Teste de log — ${guild.name}`,
        color: COLORS.white,
        thumbnail: interaction.user.displayAvatarURL(),
        groups: [
          [
            `**Categoria:** ${LOG_CATEGORIES[key].label}`,
            `**Solicitado por:** <@${interaction.user.id}>`,
          ],
          ["Se você está vendo esta mensagem, os logs desta categoria estão funcionando."],
        ],
      });
      await interaction.editReply({ components: await categoryPanel(guild, key) });
      if (!sent) {
        await warn(
          interaction,
          "Não consegui enviar o teste. Confira se o canal existe e se eu tenho permissão para ver e enviar mensagens nele."
        );
      }
      return;
    }

    case "logs_create": {
      await interaction.deferUpdate();
      try {
        const channel = await createLogChannel(interaction, key);
        await updateCategory(guild.id, key, { channelId: channel.id, enabled: true });
      } catch (err) {
        console.error("[LOGS] Erro ao criar canal:", err);
        await warn(interaction, "Não consegui criar o canal. Verifique se tenho a permissão Gerenciar Canais.");
      }
      return interaction.editReply({ components: await categoryPanel(guild, key) });
    }

    default:
      return;
  }
}

// ---------- selects ----------

async function handleLogsSelect(interaction) {
  if (!(await guard(interaction))) return;
  const [action, key] = interaction.customId.split(":");
  const { guild } = interaction;

  // Escolheu a categoria no menu
  if (action === "logs_menu") {
    const chosen = interaction.values[0];
    if (!LOG_CATEGORIES[chosen]) return;
    return interaction.update({ components: await categoryPanel(guild, chosen) });
  }

  // Escolheu o canal de uma categoria
  if (action === "logs_channel") {
    if (!LOG_CATEGORIES[key]) return;
    const channel = guild.channels.cache.get(interaction.values[0]);
    if (!canSend(channel, guild)) {
      return interaction.reply({
        content: "Eu não tenho permissão para ver e enviar mensagens nesse canal. Ajuste as permissões e tente de novo.",
        flags: EPHEMERAL,
      });
    }
    await updateCategory(guild.id, key, { channelId: channel.id, enabled: true });
    return interaction.update({ components: await categoryPanel(guild, key) });
  }

  // Canal único para tudo
  if (action === "logs_all_channel") {
    const channel = guild.channels.cache.get(interaction.values[0]);
    if (!canSend(channel, guild)) {
      return interaction.reply({
        content: "Eu não tenho permissão para ver e enviar mensagens nesse canal. Ajuste as permissões e tente de novo.",
        flags: EPHEMERAL,
      });
    }
    await setAllChannels(guild.id, channel.id);
    return interaction.update({ components: await mainPanel(guild) });
  }
}

module.exports = { openLogsPanel, handleLogsButton, handleLogsSelect };
