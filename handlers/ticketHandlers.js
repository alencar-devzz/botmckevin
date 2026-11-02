const { ChannelType, MessageFlags, EmbedBuilder } = require("discord.js");
const GuildConfig = require("../database/models/GuildConfig");
const { getTicketSettings, applyVars, getOption } = require("../utils/ticketSettings");
const { loadTicketMedia } = require("../utils/ticketMedia");
const {
  buildTicketPanel,
  buildTicketContainer,
  buildClaimedContainer,
  buildTicketCreatedEphemeral,
} = require("../ui/ticket");

// Apenas quem tem um dos cargos de atendimento (configurados no menu)
function isStaff(member, settings) {
  return settings.attendRoles.length > 0 && member.roles.cache.hasAny(...settings.attendRoles);
}

// Aviso de falta de permissão: efêmera dentro de uma embed tradicional
function replyNoPermission(interaction, action) {
  const embed = new EmbedBuilder()
    .setColor(0xff1a1a)
    .setDescription(`<@${interaction.user.id}> Você não tem permissão para ${action} tickets.`);

  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

// Select menu do painel: cria o tópico privado
async function handleTicketSelect(interaction) {
  const settings = await getTicketSettings(interaction.guild.id);
  const optionKey = interaction.values[0];
  const option = settings.options.find((o) => o.key === optionKey);
  if (!option) {
    // A opção foi removida/alterada depois que esse painel foi enviado
    loadTicketMedia(settings)
      .then((media) =>
        interaction.message.edit({
          components: buildTicketPanel(settings, media),
          flags: MessageFlags.IsComponentsV2,
        })
      )
      .catch(() => {});
    return interaction.reply({
      content: "Essa opção não está mais disponível. Tente novamente pelo painel atualizado.",
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Mídia (imagens enviadas ficam no MongoDB e são anexadas na mensagem)
  const media = await loadTicketMedia(settings, { withData: true });

  // Reseta o select do painel (ele não fica marcado na opção escolhida).
  // Sem "files": os anexos que já estão no painel continuam lá.
  interaction.message
    .edit({
      components: buildTicketPanel(settings, { panel: { items: media.panel.items } }),
      flags: MessageFlags.IsComponentsV2,
    })
    .catch(() => {});

  const user = interaction.user;

  try {
    // Número do ticket (contador por servidor)
    // strict:false + lean garantem que o contador funcione mesmo se o schema estiver desatualizado
    const config = await GuildConfig.findOneAndUpdate(
      { guildId: interaction.guild.id },
      { $inc: { ticketCounter: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true, strict: false }
    ).lean();

    const threadName =
      applyVars(settings.threadName, {
        username: user.username,
        number: config.ticketCounter,
        option: option.label,
        server: interaction.guild.name,
      })
        .trim()
        .slice(0, 100) || `ticket-${config.ticketCounter}`;

    const thread = await interaction.channel.threads.create({
      name: threadName,
      type: ChannelType.PrivateThread,
      invitable: false,
      autoArchiveDuration: 10080,
      reason: `Ticket aberto por ${user.tag}`,
    });

    await thread.members.add(user.id);

    // Fileira de menção (fora do container). Marcar os cargos adiciona a equipe no tópico privado.
    const mentionRoles = settings.mentionRoles;
    const mentions = [`<@${user.id}>`, ...mentionRoles.map((id) => `<@&${id}>`)].join(", ");
    await thread.send({
      content: mentions,
      allowedMentions: { users: [user.id], roles: mentionRoles },
    });

    await thread.send({
      components: [
        buildTicketContainer({
          author: user,
          optionKey,
          settings,
          guildName: interaction.guild.name,
          media,
        }),
      ],
      files: media.internal.files,
      flags: MessageFlags.IsComponentsV2,
    });

    const url = `https://discord.com/channels/${interaction.guild.id}/${thread.id}`;
    return interaction.editReply({
      components: buildTicketCreatedEphemeral(url),
      flags: MessageFlags.IsComponentsV2,
    });
  } catch (err) {
    console.error("[TICKET] Erro ao criar ticket:", err);
    return interaction.editReply({
      content:
        "Não consegui abrir o ticket. Verifique se eu tenho as permissões de criar tópicos privados, enviar mensagens em tópicos e gerenciar tópicos neste canal.",
    });
  }
}

// Botões Assumir / Finalizar dentro do tópico
async function handleTicketButton(interaction) {
  const { customId } = interaction;
  const settings = await getTicketSettings(interaction.guild.id);

  const isClaim = customId.startsWith("ticket_claim:");

  if (!isStaff(interaction.member, settings)) {
    return replyNoPermission(interaction, isClaim ? "assumir" : "finalizar");
  }

  if (isClaim) {
    const [, authorId, optionKey] = customId.split(":");
    const author = await interaction.client.users.fetch(authorId);
    getOption(settings, optionKey); // garante fallback caso a opção tenha sido removida
    const media = await loadTicketMedia(settings, { withData: true });

    // Atualiza o painel do ticket (botão vira "Assumido" cinza e desativado)
    await interaction.update({
      components: [
        buildTicketContainer({
          author,
          optionKey,
          claimedBy: interaction.user,
          settings,
          guildName: interaction.guild.name,
          media,
        }),
      ],
      files: media.internal.files,
      attachments: [],
    });

    // 1) menção do autor, sozinha
    await interaction.channel.send({
      content: `<@${authorId}>`,
      allowedMentions: { users: [authorId] },
    });

    // 2) container sozinho, sem pingar o staff
    await interaction.channel.send({
      components: [
        buildClaimedContainer({
          staffId: interaction.user.id,
          authorId,
          timestamp: Math.floor(Date.now() / 1000),
          settings,
          guildName: interaction.guild.name,
        }),
      ],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (customId === "ticket_close") {
    await interaction.deferUpdate().catch(() => {});
    await interaction.channel.delete("Ticket finalizado").catch((err) => {
      console.error("[TICKET] Erro ao excluir tópico:", err);
    });
  }
}

module.exports = { handleTicketSelect, handleTicketButton };
