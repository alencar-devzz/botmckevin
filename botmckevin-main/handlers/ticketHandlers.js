const { ChannelType, MessageFlags, EmbedBuilder } = require("discord.js");
const GuildConfig = require("../database/models/GuildConfig");
const { applyVars, getOption, defaultOptions, fallbackPanel } = require("../utils/ticketSettings");
const {
  listPanels,
  getPanel,
  createPanel,
  findPanelByMessage,
} = require("../utils/ticketPanelStore");
const { loadTicketMedia } = require("../utils/ticketMedia");
const {
  getOpenTickets,
  createRecord,
  findRecord,
  setClaimed,
  deleteRecord,
} = require("../utils/ticketRecords");
const {
  buildTicketPanel,
  buildTicketContainer,
  buildClaimedMessage,
  buildTicketCreatedEphemeral,
  buildLimitReached,
  buildCloseConfirm,
} = require("../ui/ticket");
const { buildReasonModal } = require("../ui/ticketConfigModals");

const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL = MessageFlags.Ephemeral;

// Cargos que podem assumir/finalizar: os do painel + os próprios da opção
function isStaff(member, panel, option) {
  const roles = [...new Set([...panel.attendRoles, ...(option?.staffRoles ?? [])])];
  return roles.length > 0 && member.roles.cache.hasAny(...roles);
}

// Aviso de falta de permissão: efêmera dentro de uma embed tradicional
function replyNoPermission(interaction, action) {
  const embed = new EmbedBuilder().setDescription(
    `<@${interaction.user.id}> Você não tem permissão para ${action} tickets.`
  );

  return interaction.reply({ embeds: [embed], flags: EPHEMERAL });
}

// Painel de um ticket já aberto. Painéis excluídos ou botões antigos caem num painel genérico.
async function panelForTicket(guild, panelId) {
  if (panelId) return (await getPanel(panelId)) ?? fallbackPanel(guild.id);
  const panels = await listPanels(guild.id);
  return panels[0] ?? fallbackPanel(guild.id);
}

// Painel que gerou o clique de abertura (botão novo ou select de uma mensagem antiga)
async function panelForOpen(interaction) {
  const { customId, guild } = interaction;
  if (customId.startsWith("ticket_open:")) return getPanel(customId.split(":")[1]);

  // Mensagem antiga, anterior aos painéis múltiplos
  const byMessage = await findPanelByMessage(guild.id, interaction.message.id);
  if (byMessage) return byMessage;

  const panels = await listPanels(guild.id);
  if (panels.length) return panels[0];

  return createPanel(guild.id, {
    name: "Painel principal",
    title: null,
    options: defaultOptions(),
    sent: [{ channelId: interaction.channelId, messageId: interaction.message.id }],
  });
}

// Abre o ticket (select menu ou botão do painel)
async function handleTicketOpen(interaction) {
  const { guild, user } = interaction;
  const isSelect = interaction.isStringSelectMenu();

  const panel = await panelForOpen(interaction);
  if (!panel) {
    return interaction.reply({
      content: "Esse painel não existe mais. Peça à equipe para enviar um painel atualizado.",
      flags: EPHEMERAL,
    });
  }

  // O select do painel não fica marcado na opção escolhida: reenvia o painel limpo (sem trocar os anexos)
  if (isSelect) {
    loadTicketMedia(panel)
      .then((media) =>
        interaction.message.edit({
          components: buildTicketPanel(panel, { panel: { items: media.panel.items } }),
          flags: V2,
        })
      )
      .catch(() => {});
  }

  if (!panel.enabled) {
    return interaction.reply({
      content: "O atendimento deste painel está temporariamente indisponível.",
      flags: EPHEMERAL,
    });
  }

  const option = isSelect ? panel.options.find((o) => o.key === interaction.values[0]) : panel.options[0];
  if (!option) {
    return interaction.reply({
      content: "Essa opção não está mais disponível. Tente novamente pelo painel atualizado.",
      flags: EPHEMERAL,
    });
  }

  // Limite de tickets abertos por pessoa
  if (panel.maxPerUser > 0) {
    const open = await getOpenTickets(interaction.client, guild.id, panel.id, user.id);
    if (open.length >= panel.maxPerUser) {
      return interaction.reply({
        components: buildLimitReached(panel, open),
        flags: V2 | EPHEMERAL,
      });
    }
  }

  // Pergunta o motivo antes de criar
  if (panel.askReason) return interaction.showModal(buildReasonModal(panel.id, option.key));

  return createTicket(interaction, panel, option, null);
}

// Resposta do modal "Qual o motivo do ticket?"
async function handleTicketModal(interaction) {
  const [, panelId, optionKey] = interaction.customId.split(":");
  const panel = await getPanel(panelId);
  if (!panel) {
    return interaction.reply({ content: "Esse painel não existe mais.", flags: EPHEMERAL });
  }
  if (!panel.enabled) {
    return interaction.reply({
      content: "O atendimento deste painel está temporariamente indisponível.",
      flags: EPHEMERAL,
    });
  }

  const option = panel.options.find((o) => o.key === optionKey);
  if (!option) {
    return interaction.reply({ content: "Essa opção não está mais disponível.", flags: EPHEMERAL });
  }

  // Confere o limite de novo (o modal pode ter ficado aberto por um tempo)
  if (panel.maxPerUser > 0) {
    const open = await getOpenTickets(interaction.client, interaction.guild.id, panel.id, interaction.user.id);
    if (open.length >= panel.maxPerUser) {
      return interaction.reply({
        components: buildLimitReached(panel, open),
        flags: V2 | EPHEMERAL,
      });
    }
  }

  const reason = interaction.fields.getTextInputValue("reason").trim() || null;
  return createTicket(interaction, panel, option, reason);
}

// Cria o tópico privado do ticket.
// Neste servidor as respostas pelo webhook da interação (editReply/followUp) travam sem erro, então a resposta
// ao usuário sai por interaction.reply (o mesmo caminho que funciona), logo depois de criar o tópico e antes
// dos 3s do Discord. O resto (mensagens e registro) é feito em seguida.
async function createTicket(interaction, panel, option, reason) {
  const { guild, user } = interaction;

  const t0 = Date.now();
  const step = (name) => console.log(`[TICKET] ${name} (+${Date.now() - t0}ms)`);
  step("abrindo ticket");

  let answered = false;
  try {
    // Número do ticket (contador por servidor)
    const config = await GuildConfig.findOneAndUpdate(
      { guildId: guild.id },
      { $inc: { ticketCounter: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true, strict: false }
    ).lean();
    const number = config.ticketCounter;

    const threadName =
      applyVars(panel.threadName, {
        username: user.username,
        number,
        option: option.label,
        server: guild.name,
      })
        .trim()
        .slice(0, 100) || `ticket-${number}`;

    // Canal onde o tópico é criado: o escolhido no painel ou o mesmo canal do clique
    let parent = interaction.channel;
    if (panel.ticketChannelId) {
      const chosen = await guild.channels.fetch(panel.ticketChannelId).catch(() => null);
      if (chosen?.type === ChannelType.GuildText) parent = chosen;
    }

    const thread = await parent.threads.create({
      name: threadName,
      type: ChannelType.PrivateThread,
      invitable: false,
      autoArchiveDuration: panel.archiveMinutes,
      reason: `Ticket aberto por ${user.tag} (${panel.name})`,
    });
    step("tópico criado");

    // Responde já (confirmação com o botão para o ticket) e adiciona a pessoa ao tópico ao mesmo tempo
    const url = `https://discord.com/channels/${guild.id}/${thread.id}`;
    const successVars = {
      user: `<@${user.id}>`,
      username: user.username,
      option: option.label,
      server: guild.name,
      number,
      panel: panel.name,
    };
    answered = true;
    const replied = interaction
      .reply({
        components: buildTicketCreatedEphemeral(panel, url, successVars),
        flags: V2 | EPHEMERAL,
      })
      .then(() => step("resposta enviada"))
      .catch((err) => console.error("[TICKET] Não consegui responder ao clique:", err?.message ?? err));
    await Promise.all([replied, thread.members.add(user.id)]);
    step("pessoa adicionada");

    // Mídia (imagens enviadas ficam no MongoDB e são anexadas na mensagem)
    const media = await loadTicketMedia(panel, { withData: true });

    // Fileira de menção (fora do container). Marcar os cargos adiciona a equipe no tópico privado.
    const mentionRoles = option.staffRoles?.length ? option.staffRoles : panel.mentionRoles;
    const mentions = [`<@${user.id}>`, ...mentionRoles.map((id) => `<@&${id}>`)].join(", ");
    await thread.send({
      content: mentions,
      allowedMentions: { users: [user.id], roles: mentionRoles },
    });

    const record = { number, reason, createdAt: new Date() };
    await thread.send({
      components: [
        buildTicketContainer({ panel, option, author: user, record, guildName: guild.name, media }),
      ],
      files: media.internal.files,
      flags: V2,
      allowedMentions: { parse: [] }, // o painel interno cita pessoas, mas nunca pinga
    });

    await createRecord({
      guildId: guild.id,
      panelId: panel.id,
      threadId: thread.id,
      userId: user.id,
      optionKey: option.key,
      number,
      reason,
    });
    step("ticket pronto");
  } catch (err) {
    console.error("[TICKET] Erro ao criar ticket:", err);
    if (!answered) {
      await interaction
        .reply({
          content:
            "Não consegui abrir o ticket. Verifique se eu tenho as permissões de criar tópicos privados, enviar mensagens em tópicos e gerenciar tópicos neste canal.",
          flags: EPHEMERAL,
        })
        .catch(() => {});
    }
  }
}

// Botões do painel (modo botão) e Assumir / Finalizar dentro do tópico
async function handleTicketButton(interaction) {
  const { customId, guild } = interaction;

  if (customId.startsWith("ticket_open:")) return handleTicketOpen(interaction);

  const parts = customId.split(":");
  const action = parts[0];

  // Formato novo: ticket_claim:<autor>:<painel>:<opção> | ticket_close:<painel>:<opção>
  // Formato antigo: ticket_claim:<autor>:<opção> | ticket_close
  let authorId = null;
  let panelId = null;
  let optionKey = null;
  if (action === "ticket_claim") {
    authorId = parts[1];
    if (parts.length >= 4) [, , panelId, optionKey] = parts;
    else optionKey = parts[2];
  } else if (parts.length >= 3) {
    [, panelId, optionKey] = parts;
  }

  const panel = await panelForTicket(guild, panelId);
  const option = optionKey ? getOption(panel, optionKey) : null;
  const isClaim = action === "ticket_claim";

  if (!isStaff(interaction.member, panel, option)) {
    console.log(`[TICKET] ${action}: ${interaction.user.id} sem cargo de atendimento no painel`);
    return replyNoPermission(interaction, isClaim ? "assumir" : "finalizar");
  }

  if (isClaim) {
    // Logs de diagnóstico do botão Assumir (mostram em qual etapa ele para, se parar)
    const t0 = Date.now();
    const step = (name) => console.log(`[CLAIM] ${name} (+${Date.now() - t0}ms)`);
    step("início");
    // Confirma o clique já (ganha os 15 min) e edita depois a mensagem do ticket, igual ao painel groles
    await interaction.deferUpdate();
    const author = await interaction.client.users.fetch(authorId);
    step("autor carregado");
    const record = await findRecord(interaction.channelId);
    step(`registro ${record ? "encontrado" : "NÃO encontrado"}`);
    const media = await loadTicketMedia(panel, { withData: true, onlyInternal: true });
    step("imagens carregadas");

    // Atualiza o painel do ticket (botão vira "Assumido" cinza e desativado)
    await interaction.message.edit({
      components: [
        buildTicketContainer({
          panel,
          option,
          author,
          record,
          claimedBy: interaction.user,
          guildName: guild.name,
          media,
        }),
      ],
      files: media.internal.files,
      attachments: [],
      allowedMentions: { parse: [] },
    });
    step("painel atualizado");
    await setClaimed(interaction.channelId, interaction.user.id).catch(() => {});

    // Uma mensagem só: menção do autor em cima (fora do container) + container. Só o autor é pingado.
    await interaction.channel.send({
      components: buildClaimedMessage({
        panel,
        staffId: interaction.user.id,
        authorId,
        timestamp: Math.floor(Date.now() / 1000),
        guildName: guild.name,
      }),
      flags: V2,
      allowedMentions: { users: [authorId] },
    });
    step("mensagem de assumido enviada");
    return;
  }

  // Finalizar: pede confirmação quando o painel exige
  if (action === "ticket_close") {
    if (panel.confirmClose) {
      return interaction.reply({
        components: buildCloseConfirm(panel, panel.id, optionKey ?? "geral"),
        flags: V2 | EPHEMERAL,
      });
    }
    return closeTicket(interaction);
  }

  if (action === "ticket_closeok") return closeTicket(interaction);
}

async function closeTicket(interaction) {
  const threadId = interaction.channelId;
  await interaction.deferUpdate().catch(() => {});
  await deleteRecord(threadId).catch(() => {});
  await interaction.channel.delete("Ticket finalizado").catch((err) => {
    console.error("[TICKET] Erro ao excluir tópico:", err);
  });
}

// O select menu do painel usa o mesmo fluxo do botão
const handleTicketSelect = handleTicketOpen;

module.exports = { handleTicketSelect, handleTicketButton, handleTicketModal };
