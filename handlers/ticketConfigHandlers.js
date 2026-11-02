const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");
const {
  MAX_OPTIONS,
  MAX_IMAGES,
  getTicketSettings,
  updateTicketConfig,
  parseImageUrls,
} = require("../utils/ticketSettings");
const { sendTicketPanel, refreshTicketPanels } = require("../utils/ticketPanels");
const { describeSources, saveUploads, deleteUploads } = require("../utils/ticketMedia");
const {
  buildTicketMenuPanel,
  buildPanelExternoCfg,
  buildInternoCfg,
  buildOptionsCfg,
  buildOptionDetail,
  buildRolesCfg,
  buildSendCfg,
} = require("../ui/ticketConfig");
const {
  buildPanelTextModal,
  buildImagesModal,
  buildInternalTextModal,
  buildOptionModal,
  buildRemoveOptionsModal,
} = require("../ui/ticketConfigModals");

const EPHEMERAL = MessageFlags.Ephemeral;

// Só a equipe pode mexer na configuração dos tickets
async function guard(interaction) {
  if (interaction.member?.roles?.cache?.hasAny(...ALL_STAFF_ROLE_IDS)) return true;
  await interaction.reply({
    content: "Você não tem permissão para configurar o sistema de tickets.",
    flags: EPHEMERAL,
  });
  return false;
}

// Atualiza os painéis já enviados em segundo plano (não trava a resposta ao usuário)
function refreshInBackground(interaction, settings) {
  refreshTicketPanels(interaction.client, interaction.guild.id, settings).catch((err) =>
    console.error("[TICKET CONFIG] Erro ao atualizar painéis:", err.message)
  );
}

const clean = (value) => {
  const v = value?.trim();
  return v ? v : null;
};

// Lê os valores de um select do modal (vazio se o select não existir)
function selectValues(interaction, id) {
  try {
    return interaction.fields.getStringSelectValues(id) ?? [];
  } catch {
    return [];
  }
}

// Move/insere um item numa posição (0-based) da lista
function placeAt(list, item, position) {
  const index = Math.max(0, Math.min(Number.isInteger(position) ? position : list.length, list.length));
  const copy = [...list];
  copy.splice(index, 0, item);
  return copy;
}

// Modal de imagens: mantém as marcadas no select, soma uploads e links novos
const IMAGE_SCOPES = {
  panel: {
    modalId: "tcfg_modal_panel_images",
    sources: (s) => s.panelSources,
    field: "panelImages",
    build: buildPanelExternoCfg,
    refresh: true,
  },
  internal: {
    modalId: "tcfg_modal_int_images",
    sources: (s) => s.internalSources,
    field: "internalImages",
    build: buildInternoCfg,
    refresh: false,
  },
};

async function handleImagesModal(interaction, scope) {
  const cfg = IMAGE_SCOPES[scope];
  const guildId = interaction.guild.id;

  // Baixar os arquivos pode levar alguns segundos
  await interaction.deferUpdate();

  const before = await getTicketSettings(guildId);
  const current = cfg.sources(before);

  const keepIndexes = new Set(selectValues(interaction, "keep"));
  const kept = current.filter((_, index) => keepIndexes.has(String(index)));
  const removed = current.filter((_, index) => !keepIndexes.has(String(index)));

  // 1) arquivos enviados
  const uploaded = interaction.fields.getUploadedFiles("upload", false);
  const { stored, rejected } = await saveUploads({
    guildId,
    scope,
    files: uploaded ? [...uploaded.values()] : [],
    existingSources: kept,
    room: Math.max(0, MAX_IMAGES - kept.length),
  });
  const uploadedSources = stored.map((id) => `db:${id}`);

  // 2) links digitados
  const { urls, invalid } = parseImageUrls(interaction.fields.getTextInputValue("links"));
  const linkRoom = Math.max(0, MAX_IMAGES - kept.length - uploadedSources.length);
  const newLinks = urls.filter((u) => !kept.includes(u)).slice(0, linkRoom);
  const ignoredLinks = invalid + Math.max(0, urls.filter((u) => !kept.includes(u)).length - newLinks.length);

  const finalSources = [...kept, ...uploadedSources, ...newLinks];
  const settings = await updateTicketConfig(guildId, { [cfg.field]: finalSources });

  // Apaga do banco só o que saiu da lista
  await deleteUploads(removed).catch((err) =>
    console.error("[TICKET IMAGENS] Erro ao apagar imagens removidas:", err.message)
  );

  await interaction.editReply({ components: cfg.build(settings) });
  if (cfg.refresh) refreshInBackground(interaction, settings);

  const notes = [...rejected];
  if (ignoredLinks) notes.push(`${ignoredLinks} link(s) ignorados (inválidos ou acima do limite).`);
  if (notes.length) {
    await interaction
      .followUp({ content: notes.map((n) => `• ${n}`).join("\n").slice(0, 1900), flags: EPHEMERAL })
      .catch(() => {});
  }
}

// ---------- selects ----------

async function handleTicketConfigSelect(interaction) {
  if (!(await guard(interaction))) return;
  const { customId, values } = interaction;
  const guildId = interaction.guild.id;

  switch (customId) {
    case "tcfg_menu": {
      const settings = await getTicketSettings(guildId);
      const panels = {
        painel: buildPanelExternoCfg,
        interno: buildInternoCfg,
        opcoes: buildOptionsCfg,
        cargos: buildRolesCfg,
        enviar: buildSendCfg,
      };
      const build = panels[values[0]];
      if (!build) return;
      return interaction.update({ components: build(settings) });
    }

    case "tcfg_opt_select": {
      const settings = await getTicketSettings(guildId);
      const option = settings.options.find((o) => o.key === values[0]);
      if (!option) return interaction.update({ components: buildOptionsCfg(settings) });
      return interaction.update({ components: buildOptionDetail(settings, option) });
    }

    case "tcfg_role_attend": {
      const settings = await updateTicketConfig(guildId, { attendRoles: values });
      return interaction.update({ components: buildRolesCfg(settings) });
    }

    case "tcfg_role_mention": {
      const settings = await updateTicketConfig(guildId, { mentionRoles: values });
      return interaction.update({ components: buildRolesCfg(settings) });
    }

    case "tcfg_send_channel": {
      await interaction.deferUpdate();
      const channel = interaction.guild.channels.cache.get(values[0]);
      const perms = channel?.permissionsFor(interaction.guild.members.me);
      const needed = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.CreatePrivateThreads,
        PermissionFlagsBits.SendMessagesInThreads,
      ];

      let settings = await getTicketSettings(guildId);
      if (!channel || !perms?.has(needed)) {
        return interaction.editReply({
          components: buildSendCfg(
            settings,
            "Não consegui enviar: preciso de permissão para ver o canal, enviar mensagens, criar tópicos privados e enviar mensagens em tópicos."
          ),
        });
      }

      try {
        await sendTicketPanel(channel);
        settings = await getTicketSettings(guildId);
        return interaction.editReply({
          components: buildSendCfg(settings, `Painel enviado em <#${channel.id}>.`),
        });
      } catch (err) {
        console.error("[TICKET CONFIG] Erro ao enviar painel:", err);
        return interaction.editReply({
          components: buildSendCfg(settings, "Não consegui enviar o painel nesse canal."),
        });
      }
    }

    default:
      return;
  }
}

// ---------- botões ----------

async function handleTicketConfigButton(interaction) {
  if (!(await guard(interaction))) return;
  const [action, key] = interaction.customId.split(":");
  const guildId = interaction.guild.id;

  switch (action) {
    case "tcfg_back":
      return interaction.update({ components: buildTicketMenuPanel() });

    case "tcfg_back_opts": {
      const settings = await getTicketSettings(guildId);
      return interaction.update({ components: buildOptionsCfg(settings) });
    }

    case "tcfg_panel_text": {
      const settings = await getTicketSettings(guildId);
      return interaction.showModal(buildPanelTextModal(settings));
    }

    case "tcfg_panel_images": {
      const settings = await getTicketSettings(guildId);
      return interaction.showModal(
        buildImagesModal({
          customId: IMAGE_SCOPES.panel.modalId,
          title: "Imagens do painel externo",
          current: await describeSources(settings.panelSources),
        })
      );
    }

    case "tcfg_int_text": {
      const settings = await getTicketSettings(guildId);
      return interaction.showModal(buildInternalTextModal(settings));
    }

    case "tcfg_int_images": {
      const settings = await getTicketSettings(guildId);
      return interaction.showModal(
        buildImagesModal({
          customId: IMAGE_SCOPES.internal.modalId,
          title: "Imagens do ticket interno",
          current: await describeSources(settings.internalSources),
        })
      );
    }

    case "tcfg_opt_add": {
      const settings = await getTicketSettings(guildId);
      if (settings.options.length >= MAX_OPTIONS) {
        return interaction.reply({
          content: `O limite é de ${MAX_OPTIONS} opções.`,
          flags: EPHEMERAL,
        });
      }
      return interaction.showModal(
        buildOptionModal({
          customId: "tcfg_modal_opt_add",
          title: "Nova opção",
          options: settings.options,
          position: settings.options.length,
        })
      );
    }

    case "tcfg_opt_edit": {
      const settings = await getTicketSettings(guildId);
      const option = settings.options.find((o) => o.key === key);
      if (!option) return interaction.update({ components: buildOptionsCfg(settings) });
      return interaction.showModal(
        buildOptionModal({
          customId: `tcfg_modal_opt_edit:${key}`,
          title: "Editar opção",
          option,
          options: settings.options,
          position: settings.options.findIndex((o) => o.key === key),
        })
      );
    }

    case "tcfg_opt_remove": {
      const settings = await getTicketSettings(guildId);
      if (settings.options.length <= 1) {
        return interaction.reply({
          content: "O painel precisa ter pelo menos uma opção.",
          flags: EPHEMERAL,
        });
      }
      return interaction.showModal(buildRemoveOptionsModal(settings.options));
    }

    case "tcfg_opt_del": {
      const current = await getTicketSettings(guildId);
      if (current.options.length <= 1) {
        return interaction.reply({
          content: "O painel precisa ter pelo menos uma opção.",
          flags: EPHEMERAL,
        });
      }
      const settings = await updateTicketConfig(guildId, {
        options: current.options.filter((o) => o.key !== key),
      });
      await interaction.update({ components: buildOptionsCfg(settings) });
      return refreshInBackground(interaction, settings);
    }

    case "tcfg_roles_reset": {
      const settings = await updateTicketConfig(guildId, {}, ["attendRoles", "mentionRoles"]);
      return interaction.update({ components: buildRolesCfg(settings) });
    }

    default:
      return;
  }
}

// ---------- modais ----------

async function handleTicketConfigModal(interaction) {
  if (!(await guard(interaction))) return;
  const [action, key] = interaction.customId.split(":");
  const guildId = interaction.guild.id;
  const field = (id) => interaction.fields.getTextInputValue(id);

  switch (action) {
    case "tcfg_modal_panel_text": {
      const settings = await updateTicketConfig(guildId, {
        panelTitle: clean(field("panel_title")),
        panelDescription: clean(field("panel_description")),
        panelPlaceholder: clean(field("panel_placeholder")),
      });
      await interaction.update({ components: buildPanelExternoCfg(settings) });
      return refreshInBackground(interaction, settings);
    }

    case "tcfg_modal_panel_images":
      return handleImagesModal(interaction, "panel");

    case "tcfg_modal_int_text": {
      const settings = await updateTicketConfig(guildId, {
        internalHeading: clean(field("int_heading")),
        internalMessage: clean(field("int_message")),
        claimedMessage: clean(field("int_claimed")),
        threadName: clean(field("int_thread")),
      });
      return interaction.update({ components: buildInternoCfg(settings) });
    }

    case "tcfg_modal_int_images":
      return handleImagesModal(interaction, "internal");

    case "tcfg_modal_opt_add": {
      const current = await getTicketSettings(guildId);
      if (current.options.length >= MAX_OPTIONS) {
        return interaction.reply({
          content: `O limite é de ${MAX_OPTIONS} opções.`,
          flags: EPHEMERAL,
        });
      }
      const label = field("opt_label").trim();
      const option = {
        key: `o${Date.now().toString(36)}`,
        label,
        description: clean(field("opt_description")),
        title: clean(field("opt_title")) ?? label.toUpperCase(),
        message: clean(field("opt_message")),
      };
      const position = Number.parseInt(selectValues(interaction, "opt_position")[0], 10);
      const settings = await updateTicketConfig(guildId, {
        options: placeAt(current.options, option, position),
      });
      await interaction.update({ components: buildOptionsCfg(settings) });
      return refreshInBackground(interaction, settings);
    }

    case "tcfg_modal_opt_edit": {
      const current = await getTicketSettings(guildId);
      const existing = current.options.find((o) => o.key === key);
      if (!existing) return interaction.update({ components: buildOptionsCfg(current) });

      const label = field("opt_label").trim();
      const updated = {
        key,
        label,
        description: clean(field("opt_description")),
        title: clean(field("opt_title")) ?? label.toUpperCase(),
        message: clean(field("opt_message")),
      };
      const position = Number.parseInt(selectValues(interaction, "opt_position")[0], 10);
      const others = current.options.filter((o) => o.key !== key);
      const settings = await updateTicketConfig(guildId, {
        options: placeAt(others, updated, position),
      });
      await interaction.update({ components: buildOptionDetail(settings, updated) });
      return refreshInBackground(interaction, settings);
    }

    case "tcfg_modal_opt_remove": {
      const current = await getTicketSettings(guildId);
      const toRemove = new Set(selectValues(interaction, "opt_remove"));
      const remaining = current.options.filter((o) => !toRemove.has(o.key));

      if (!remaining.length) {
        return interaction.reply({
          content: "O painel precisa ter pelo menos uma opção.",
          flags: EPHEMERAL,
        });
      }

      const settings = await updateTicketConfig(guildId, { options: remaining });
      await interaction.update({ components: buildOptionsCfg(settings) });
      return refreshInBackground(interaction, settings);
    }

    default:
      return;
  }
}

module.exports = {
  handleTicketConfigSelect,
  handleTicketConfigButton,
  handleTicketConfigModal,
};
