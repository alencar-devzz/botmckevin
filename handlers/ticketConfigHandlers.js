const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");
const {
  MAX_OPTIONS,
  MAX_IMAGES,
  MAX_PANELS,
  COLOR_PRESETS,
  ARCHIVE_OPTIONS,
  defaultOptions,
  parseHexColor,
  parseImageUrls,
  makeOptionKey,
  DEFAULTS,
} = require("../utils/ticketSettings");
const {
  listPanels,
  getPanel,
  createPanel,
  updatePanel,
  deletePanelDoc,
} = require("../utils/ticketPanelStore");
const { sendTicketPanel, refreshTicketPanels, deleteSentPanels } = require("../utils/ticketPanels");
const {
  describeSources,
  saveUploads,
  deleteUploads,
  cloneUploads,
  loadTicketMedia,
} = require("../utils/ticketMedia");
const { countOpen } = require("../utils/ticketRecords");
const { buildTicketPanel } = require("../ui/ticket");
const {
  buildTicketHome,
  buildPanelManager,
  buildSection,
  buildOptionDetail,
  buildDeleteConfirm,
} = require("../ui/ticketConfig");
const {
  buildNewPanelModal,
  buildRenameModal,
  buildAppearanceTextModal,
  buildColorModal,
  buildImagesModal,
  buildModeModal,
  buildButtonModal,
  buildPlaceholderModal,
  buildInternalTextModal,
  buildArchiveModal,
  buildLimitModal,
  buildOptionModal,
  buildRemoveOptionsModal,
} = require("../ui/ticketConfigModals");

const EPHEMERAL = MessageFlags.Ephemeral;

// Só administradores e a equipe podem mexer na configuração dos tickets
async function guard(interaction) {
  const member = interaction.member;
  const allowed =
    member?.permissions?.has(PermissionFlagsBits.Administrator) ||
    member?.roles?.cache?.hasAny(...ALL_STAFF_ROLE_IDS);
  if (allowed) return true;

  await interaction.reply({
    content: "Você não tem permissão para configurar o sistema de tickets.",
    flags: EPHEMERAL,
  });
  return false;
}

const warn = (interaction, content) =>
  interaction.followUp({ content, flags: EPHEMERAL }).catch(() => {});

const parse = (customId) => {
  const [action, id, extra] = customId.split(":");
  return { action, id, extra };
};

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

// Insere um item numa posição (0-based) da lista
function placeAt(list, item, position) {
  const index = Math.max(0, Math.min(Number.isInteger(position) ? position : list.length, list.length));
  const copy = [...list];
  copy.splice(index, 0, item);
  return copy;
}

// Formato salvo no banco (staffRoles só quando existir)
const serializeOptions = (options) =>
  options.map((o) => {
    const doc = {
      key: o.key,
      label: o.label,
      description: o.description ?? null,
      title: o.title,
      message: o.message ?? null,
    };
    if (o.staffRoles?.length) doc.staffRoles = o.staffRoles;
    return doc;
  });

// Separa o que vai ser salvo do que volta ao padrão (valor nulo)
function setOrUnset(fields) {
  const set = {};
  const unset = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value == null) unset.push(key);
    else set[key] = value;
  }
  return { set, unset };
}

// Atualiza os painéis já enviados em segundo plano (não trava a resposta)
function refreshInBackground(interaction, panel) {
  refreshTicketPanels(interaction.client, panel).catch((err) =>
    console.error("[TICKET CONFIG] Erro ao atualizar painéis:", err.message)
  );
}

// ---------- telas ----------

async function homeView(guild) {
  const panels = await listPanels(guild.id);
  const openByPanel = {};
  for (const panel of panels) openByPanel[panel.id] = await countOpen(guild.id, panel.id);
  return buildTicketHome({ panels, openByPanel });
}

async function managerView(guild, panel) {
  return buildPanelManager({ panel, open: await countOpen(guild.id, panel.id) });
}

async function missingPanel(interaction) {
  const payload = { content: "Esse painel não existe mais.", flags: EPHEMERAL };
  return interaction.replied || interaction.deferred
    ? interaction.followUp(payload)
    : interaction.reply(payload);
}

// Chamado pelo menu Moderação > Sistema de tickets
async function openTicketHome(interaction) {
  if (!(await guard(interaction))) return;
  return interaction.update({ components: await homeView(interaction.guild) });
}

// ---------- imagens (upload + manter/remover + links) ----------

const IMAGE_SCOPES = {
  panel: {
    modalAction: "tcfg_modal_a_images",
    sources: (p) => p.panelSources,
    field: "panelImages",
    section: "aparencia",
    refresh: true,
  },
  internal: {
    modalAction: "tcfg_modal_i_images",
    sources: (p) => p.internalSources,
    field: "internalImages",
    section: "interno",
    refresh: false,
  },
};

async function handleImagesModal(interaction, scope, panelId) {
  const cfg = IMAGE_SCOPES[scope];
  const guildId = interaction.guild.id;

  const before = await getPanel(panelId);
  if (!before) return missingPanel(interaction);

  // Baixar os arquivos pode levar alguns segundos
  await interaction.deferUpdate();

  const current = cfg.sources(before);
  const keepIndexes = new Set(selectValues(interaction, "keep"));
  const kept = current.filter((_, index) => keepIndexes.has(String(index)));
  const removed = current.filter((_, index) => !keepIndexes.has(String(index)));

  // 1) arquivos enviados
  const uploaded = interaction.fields.getUploadedFiles("upload", false);
  const { stored, rejected } = await saveUploads({
    guildId,
    panelId,
    scope,
    files: uploaded ? [...uploaded.values()] : [],
    existingSources: kept,
    room: Math.max(0, MAX_IMAGES - kept.length),
  });
  const uploadedSources = stored.map((id) => `db:${id}`);

  // 2) links digitados
  const { urls, invalid } = parseImageUrls(interaction.fields.getTextInputValue("links"));
  const fresh = urls.filter((u) => !kept.includes(u));
  const linkRoom = Math.max(0, MAX_IMAGES - kept.length - uploadedSources.length);
  const newLinks = fresh.slice(0, linkRoom);
  const ignoredLinks = invalid + Math.max(0, fresh.length - newLinks.length);

  const finalSources = [...kept, ...uploadedSources, ...newLinks];
  const panel = finalSources.length
    ? await updatePanel(panelId, { [cfg.field]: finalSources })
    : await updatePanel(panelId, {}, [cfg.field]);

  await deleteUploads(removed).catch((err) =>
    console.error("[TICKET IMAGENS] Erro ao apagar imagens removidas:", err.message)
  );

  await interaction.editReply({ components: buildSection(cfg.section, panel, interaction.guild) });
  if (cfg.refresh) refreshInBackground(interaction, panel);

  const notes = [...rejected];
  if (ignoredLinks) notes.push(`${ignoredLinks} link(s) ignorados (inválidos ou acima do limite).`);
  if (notes.length) await warn(interaction, notes.map((n) => `• ${n}`).join("\n").slice(0, 1900));
}

// ---------- botões ----------

async function handleTicketConfigButton(interaction) {
  if (!(await guard(interaction))) return;
  const { action, id, extra } = parse(interaction.customId);
  const { guild } = interaction;

  // Ações que não dependem de um painel
  if (action === "tcfg_home") {
    return interaction.update({ components: await homeView(guild) });
  }

  if (action === "tcfg_new") {
    const panels = await listPanels(guild.id);
    if (panels.length >= MAX_PANELS) {
      return interaction.reply({
        content: `Você já atingiu o limite de ${MAX_PANELS} painéis. Exclua algum para criar outro.`,
        flags: EPHEMERAL,
      });
    }
    return interaction.showModal(buildNewPanelModal());
  }

  const panel = await getPanel(id);
  if (!panel) return missingPanel(interaction);

  switch (action) {
    case "tcfg_manage":
      return interaction.update({ components: await managerView(guild, panel) });

    case "tcfg_go":
      return interaction.update({ components: buildSection(extra, panel, guild) });

    case "tcfg_prev": {
      const media = await loadTicketMedia(panel, { withData: true });
      return interaction.reply({
        components: buildTicketPanel(panel, media, { preview: true }),
        files: media.panel.files,
        flags: MessageFlags.IsComponentsV2 | EPHEMERAL,
      });
    }

    // ----- aparência -----
    case "tcfg_a_text":
      return interaction.showModal(buildAppearanceTextModal(panel));
    case "tcfg_a_color":
      return interaction.showModal(buildColorModal(panel));
    case "tcfg_a_images":
      return interaction.showModal(
        buildImagesModal({
          customId: `${IMAGE_SCOPES.panel.modalAction}:${panel.id}`,
          title: "Imagens do painel",
          current: await describeSources(panel.panelSources),
        })
      );
    case "tcfg_a_info": {
      const updated = await updatePanel(id, { showInfo: !panel.showInfo });
      refreshInBackground(interaction, updated);
      return interaction.update({ components: buildSection("aparencia", updated, guild) });
    }

    // ----- abertura -----
    case "tcfg_m_mode":
      return interaction.showModal(buildModeModal(panel));
    case "tcfg_m_btn":
      return interaction.showModal(buildButtonModal(panel));
    case "tcfg_m_ph":
      return interaction.showModal(buildPlaceholderModal(panel));

    // ----- opções do menu -----
    case "tcfg_o_add":
      return interaction.showModal(
        buildOptionModal({
          customId: `tcfg_modal_o_add:${panel.id}`,
          title: "Nova opção",
          options: panel.options,
          position: panel.options.length,
        })
      );

    case "tcfg_o_edit": {
      const option = panel.options.find((o) => o.key === extra);
      if (!option) {
        return interaction.reply({ content: "Essa opção não existe mais.", flags: EPHEMERAL });
      }
      return interaction.showModal(
        buildOptionModal({
          customId: `tcfg_modal_o_edit:${panel.id}:${option.key}`,
          title: panel.mode === "button" ? "Conteúdo do ticket" : "Editar opção",
          option,
          options: panel.options,
          position: panel.options.findIndex((o) => o.key === option.key),
          simple: panel.mode === "button",
        })
      );
    }

    case "tcfg_o_rmopen": {
      if (panel.options.length <= 1) {
        return interaction.reply({ content: "O painel precisa ter pelo menos uma opção.", flags: EPHEMERAL });
      }
      return interaction.showModal(buildRemoveOptionsModal(panel));
    }

    case "tcfg_o_del": {
      if (panel.options.length <= 1) {
        return interaction.reply({ content: "O painel precisa ter pelo menos uma opção.", flags: EPHEMERAL });
      }
      const updated = await updatePanel(id, {
        options: serializeOptions(panel.options.filter((o) => o.key !== extra)),
      });
      refreshInBackground(interaction, updated);
      return interaction.update({ components: buildSection("opcoes", updated, guild) });
    }

    case "tcfg_o_rolesreset": {
      const options = panel.options.map((o) => (o.key === extra ? { ...o, staffRoles: null } : o));
      const updated = await updatePanel(id, { options: serializeOptions(options) });
      const option = updated.options.find((o) => o.key === extra);
      return interaction.update({ components: buildOptionDetail(updated, option) });
    }

    // ----- ticket interno -----
    case "tcfg_i_text":
      return interaction.showModal(buildInternalTextModal(panel));
    case "tcfg_i_images":
      return interaction.showModal(
        buildImagesModal({
          customId: `${IMAGE_SCOPES.internal.modalAction}:${panel.id}`,
          title: "Imagens do ticket interno",
          current: await describeSources(panel.internalSources),
        })
      );
    case "tcfg_i_arch":
      return interaction.showModal(buildArchiveModal(panel));
    case "tcfg_i_chanreset": {
      const updated = await updatePanel(id, {}, ["ticketChannelId"]);
      return interaction.update({ components: buildSection("interno", updated, guild) });
    }

    // ----- cargos -----
    case "tcfg_r_reset": {
      const field = extra === "attend" ? "attendRoles" : "mentionRoles";
      const updated = await updatePanel(id, {}, [field]);
      return interaction.update({ components: buildSection("cargos", updated, guild) });
    }

    // ----- regras -----
    case "tcfg_g_limit":
      return interaction.showModal(buildLimitModal(panel));
    case "tcfg_g_reason": {
      const updated = await updatePanel(id, { askReason: !panel.askReason });
      return interaction.update({ components: buildSection("regras", updated, guild) });
    }
    case "tcfg_g_confirm": {
      const updated = await updatePanel(id, { confirmClose: !panel.confirmClose });
      return interaction.update({ components: buildSection("regras", updated, guild) });
    }
    case "tcfg_g_enabled": {
      const updated = await updatePanel(id, { enabled: !panel.enabled });
      refreshInBackground(interaction, updated);
      return interaction.update({ components: buildSection("regras", updated, guild) });
    }

    // ----- publicação -----
    case "tcfg_s_refresh": {
      await interaction.deferUpdate();
      await refreshTicketPanels(interaction.client, panel);
      const updated = await getPanel(id);
      return interaction.editReply({ components: buildSection("publicacao", updated, guild) });
    }
    case "tcfg_s_clear": {
      await interaction.deferUpdate();
      await deleteSentPanels(interaction.client, panel);
      const updated = await getPanel(id);
      return interaction.editReply({ components: buildSection("publicacao", updated, guild) });
    }

    // ----- gerenciar -----
    case "tcfg_x_rename":
      return interaction.showModal(buildRenameModal(panel));

    case "tcfg_x_dup": {
      const panels = await listPanels(guild.id);
      if (panels.length >= MAX_PANELS) {
        return interaction.reply({
          content: `Você já atingiu o limite de ${MAX_PANELS} painéis.`,
          flags: EPHEMERAL,
        });
      }
      await interaction.deferUpdate();

      const copy = await createPanel(guild.id, {
        name: `${panel.name} (cópia)`.slice(0, 50),
        mode: panel.mode,
        enabled: panel.enabled,
        title: panel.title,
        description: panel.description,
        footer: panel.footer,
        color: panel.color,
        showInfo: panel.showInfo,
        placeholder: panel.placeholder === DEFAULTS.placeholder ? null : panel.placeholder,
        buttonLabel: panel.buttonLabel === DEFAULTS.buttonLabel ? null : panel.buttonLabel,
        buttonStyle: panel.buttonStyle,
        options: serializeOptions(panel.options),
        internalHeading: panel.internalHeading === DEFAULTS.internalHeading ? null : panel.internalHeading,
        internalMessage: panel.internalMessage === DEFAULTS.internalMessage ? null : panel.internalMessage,
        claimedMessage: panel.claimedMessage === DEFAULTS.claimedMessage ? null : panel.claimedMessage,
        threadName: panel.threadName === DEFAULTS.threadName ? null : panel.threadName,
        ticketChannelId: panel.ticketChannelId,
        archiveMinutes: panel.archiveMinutes,
        ...(panel.custom.attendRoles ? { attendRoles: panel.attendRoles } : {}),
        ...(panel.custom.mentionRoles ? { mentionRoles: panel.mentionRoles } : {}),
        maxPerUser: panel.maxPerUser,
        askReason: panel.askReason,
        confirmClose: panel.confirmClose,
      });

      // As imagens enviadas são copiadas para o painel novo ficar independente
      const [panelImages, internalImages] = await Promise.all([
        cloneUploads(panel.panelSources, copy.id, "panel"),
        cloneUploads(panel.internalSources, copy.id, "internal"),
      ]);
      const set = {};
      if (panelImages.length) set.panelImages = panelImages;
      if (internalImages.length) set.internalImages = internalImages;
      const finalCopy = Object.keys(set).length ? await updatePanel(copy.id, set) : copy;

      return interaction.editReply({ components: await managerView(guild, finalCopy) });
    }

    case "tcfg_x_del":
      return interaction.update({
        components: buildDeleteConfirm(panel, await countOpen(guild.id, panel.id)),
      });

    case "tcfg_x_delok": {
      await interaction.deferUpdate();
      await deleteSentPanels(interaction.client, panel);
      await deleteUploads([...panel.panelSources, ...panel.internalSources]).catch(() => {});
      await deletePanelDoc(panel.id);
      return interaction.editReply({ components: await homeView(guild) });
    }

    default:
      return;
  }
}

// ---------- selects (texto, cargo e canal) ----------

async function handleTicketConfigSelect(interaction) {
  if (!(await guard(interaction))) return;
  const { action, id, extra } = parse(interaction.customId);
  const { guild } = interaction;

  // Escolheu um painel na lista
  if (action === "tcfg_pick") {
    const panel = await getPanel(interaction.values[0]);
    if (!panel) return missingPanel(interaction);
    return interaction.update({ components: await managerView(guild, panel) });
  }

  const panel = await getPanel(id);
  if (!panel) return missingPanel(interaction);

  switch (action) {
    case "tcfg_sect":
      return interaction.update({ components: buildSection(interaction.values[0], panel, guild) });

    case "tcfg_o_pick": {
      const option = panel.options.find((o) => o.key === interaction.values[0]);
      if (!option) return missingPanel(interaction);
      return interaction.update({ components: buildOptionDetail(panel, option) });
    }

    case "tcfg_o_roles": {
      const roles = interaction.values;
      const options = panel.options.map((o) =>
        o.key === extra ? { ...o, staffRoles: roles.length ? roles : null } : o
      );
      const updated = await updatePanel(id, { options: serializeOptions(options) });
      const option = updated.options.find((o) => o.key === extra);
      return interaction.update({ components: buildOptionDetail(updated, option) });
    }

    case "tcfg_r_attend": {
      const updated = await updatePanel(id, { attendRoles: interaction.values });
      return interaction.update({ components: buildSection("cargos", updated, guild) });
    }

    case "tcfg_r_mention": {
      const updated = await updatePanel(id, { mentionRoles: interaction.values });
      return interaction.update({ components: buildSection("cargos", updated, guild) });
    }

    case "tcfg_i_chan": {
      const updated = await updatePanel(id, { ticketChannelId: interaction.values[0] });
      return interaction.update({ components: buildSection("interno", updated, guild) });
    }

    case "tcfg_s_send": {
      const channel = guild.channels.cache.get(interaction.values[0]);
      const canSend = channel
        ?.permissionsFor(guild.members.me)
        ?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]);
      if (!canSend) {
        return interaction.reply({
          content: "Eu não tenho permissão para ver e enviar mensagens nesse canal.",
          flags: EPHEMERAL,
        });
      }

      await interaction.deferUpdate();
      try {
        await sendTicketPanel(channel, panel);
      } catch (err) {
        console.error("[TICKET CONFIG] Erro ao enviar painel:", err);
        await warn(interaction, "Não consegui enviar o painel nesse canal. Verifique minhas permissões.");
      }
      const updated = await getPanel(id);
      return interaction.editReply({ components: buildSection("publicacao", updated, guild) });
    }

    default:
      return;
  }
}

// ---------- modais ----------

async function handleTicketConfigModal(interaction) {
  if (!(await guard(interaction))) return;
  const { action, id, extra } = parse(interaction.customId);
  const { guild } = interaction;
  const field = (name) => interaction.fields.getTextInputValue(name);

  // Criar painel não depende de um painel existente
  if (action === "tcfg_modal_new") {
    const name = clean(field("name"));
    if (!name) return interaction.reply({ content: "Informe um nome para o painel.", flags: EPHEMERAL });

    const panels = await listPanels(guild.id);
    if (panels.length >= MAX_PANELS) {
      return interaction.reply({ content: `Limite de ${MAX_PANELS} painéis atingido.`, flags: EPHEMERAL });
    }

    const mode = selectValues(interaction, "mode")[0] === "button" ? "button" : "select";
    const options =
      mode === "button"
        ? [{ key: "geral", label: name.slice(0, 100), description: null, title: name.toUpperCase().slice(0, 100), message: null }]
        : serializeOptions(defaultOptions());

    const panel = await createPanel(guild.id, {
      name,
      mode,
      title: name,
      description: DEFAULTS.description,
      options,
    });
    return interaction.update({ components: await managerView(guild, panel) });
  }

  if (action === "tcfg_modal_a_images") return handleImagesModal(interaction, "panel", id);
  if (action === "tcfg_modal_i_images") return handleImagesModal(interaction, "internal", id);

  const panel = await getPanel(id);
  if (!panel) return missingPanel(interaction);

  switch (action) {
    case "tcfg_modal_x_rename": {
      const name = clean(field("name"));
      if (!name) return interaction.reply({ content: "Informe um nome.", flags: EPHEMERAL });
      const updated = await updatePanel(id, { name });
      return interaction.update({ components: buildSection("gerenciar", updated, guild) });
    }

    // ----- aparência -----
    case "tcfg_modal_a_text": {
      const { set, unset } = setOrUnset({
        title: clean(field("title")),
        description: clean(field("description")),
        footer: clean(field("footer")),
      });
      const updated = await updatePanel(id, set, unset);
      refreshInBackground(interaction, updated);
      return interaction.update({ components: buildSection("aparencia", updated, guild) });
    }

    case "tcfg_modal_a_color": {
      const hex = clean(field("hex"));
      let color;
      if (hex) {
        color = parseHexColor(hex);
        if (color == null) {
          return interaction.reply({
            content: "Cor inválida. Use o formato #RRGGBB, por exemplo #00c853.",
            flags: EPHEMERAL,
          });
        }
      } else {
        color = COLOR_PRESETS[selectValues(interaction, "preset")[0]]?.value ?? null;
      }
      const updated =
        color == null ? await updatePanel(id, {}, ["color"]) : await updatePanel(id, { color });
      refreshInBackground(interaction, updated);
      return interaction.update({ components: buildSection("aparencia", updated, guild) });
    }

    // ----- abertura -----
    case "tcfg_modal_m_mode": {
      const mode = selectValues(interaction, "mode")[0] === "button" ? "button" : "select";
      const updated = await updatePanel(id, { mode });
      refreshInBackground(interaction, updated);
      return interaction.update({ components: buildSection("abertura", updated, guild) });
    }

    case "tcfg_modal_m_btn": {
      const label = clean(field("label"));
      if (!label) return interaction.reply({ content: "Informe o texto do botão.", flags: EPHEMERAL });
      const style = selectValues(interaction, "style")[0] ?? "primary";
      const updated = await updatePanel(id, { buttonLabel: label, buttonStyle: style });
      refreshInBackground(interaction, updated);
      return interaction.update({ components: buildSection("abertura", updated, guild) });
    }

    case "tcfg_modal_m_ph": {
      const value = clean(field("placeholder"));
      const updated = value
        ? await updatePanel(id, { placeholder: value })
        : await updatePanel(id, {}, ["placeholder"]);
      refreshInBackground(interaction, updated);
      return interaction.update({ components: buildSection("abertura", updated, guild) });
    }

    // ----- ticket interno -----
    case "tcfg_modal_i_text": {
      const { set, unset } = setOrUnset({
        internalHeading: clean(field("heading")),
        internalMessage: clean(field("message")),
        claimedMessage: clean(field("claimed")),
        threadName: clean(field("thread")),
      });
      const updated = await updatePanel(id, set, unset);
      return interaction.update({ components: buildSection("interno", updated, guild) });
    }

    case "tcfg_modal_i_arch": {
      const minutes = Number(selectValues(interaction, "minutes")[0]);
      if (!ARCHIVE_OPTIONS[minutes]) return;
      const updated = await updatePanel(id, { archiveMinutes: minutes });
      return interaction.update({ components: buildSection("interno", updated, guild) });
    }

    // ----- regras -----
    case "tcfg_modal_g_limit": {
      const limit = Number.parseInt(field("limit").trim(), 10);
      if (!Number.isInteger(limit) || limit < 0 || limit > 10) {
        return interaction.reply({
          content: "Informe um número de 0 a 10 (0 = sem limite).",
          flags: EPHEMERAL,
        });
      }
      const updated = await updatePanel(id, { maxPerUser: limit });
      return interaction.update({ components: buildSection("regras", updated, guild) });
    }

    // ----- opções -----
    case "tcfg_modal_o_add": {
      if (panel.options.length >= MAX_OPTIONS) {
        return interaction.reply({ content: `Limite de ${MAX_OPTIONS} opções atingido.`, flags: EPHEMERAL });
      }
      const label = clean(field("label"));
      if (!label) return interaction.reply({ content: "Informe o nome da opção.", flags: EPHEMERAL });

      const option = {
        key: makeOptionKey(label, panel.options.map((o) => o.key)),
        label,
        description: clean(field("description")),
        title: clean(field("title")) ?? label.toUpperCase().slice(0, 100),
        message: clean(field("message")),
        staffRoles: null,
      };
      const position = Number.parseInt(selectValues(interaction, "position")[0], 10);
      const updated = await updatePanel(id, {
        options: serializeOptions(placeAt(panel.options, option, position)),
      });
      refreshInBackground(interaction, updated);
      return interaction.update({ components: buildSection("opcoes", updated, guild) });
    }

    case "tcfg_modal_o_edit": {
      const current = panel.options.find((o) => o.key === extra);
      if (!current) return interaction.reply({ content: "Essa opção não existe mais.", flags: EPHEMERAL });

      const label = clean(field("label"));
      if (!label) return interaction.reply({ content: "Informe o nome da opção.", flags: EPHEMERAL });

      const simple = panel.mode === "button";
      const edited = {
        ...current,
        label,
        description: simple ? current.description : clean(field("description")),
        title: clean(field("title")) ?? label.toUpperCase().slice(0, 100),
        message: clean(field("message")),
      };

      let options;
      if (simple) {
        options = panel.options.map((o) => (o.key === extra ? edited : o));
      } else {
        const position = Number.parseInt(selectValues(interaction, "position")[0], 10);
        options = placeAt(panel.options.filter((o) => o.key !== extra), edited, position);
      }

      const updated = await updatePanel(id, { options: serializeOptions(options) });
      refreshInBackground(interaction, updated);
      return interaction.update({
        components: simple
          ? buildSection("opcoes", updated, guild)
          : buildOptionDetail(updated, updated.options.find((o) => o.key === extra)),
      });
    }

    case "tcfg_modal_o_rm": {
      const toRemove = new Set(selectValues(interaction, "remove"));
      const remaining = panel.options.filter((o) => !toRemove.has(o.key));
      if (!remaining.length) {
        return interaction.reply({ content: "O painel precisa ter pelo menos uma opção.", flags: EPHEMERAL });
      }
      const updated = await updatePanel(id, { options: serializeOptions(remaining) });
      refreshInBackground(interaction, updated);
      return interaction.update({ components: buildSection("opcoes", updated, guild) });
    }

    default:
      return;
  }
}

module.exports = {
  openTicketHome,
  handleTicketConfigButton,
  handleTicketConfigSelect,
  handleTicketConfigModal,
};
