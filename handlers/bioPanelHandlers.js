const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const {
  getToken, setToken, clearToken, getPanels, getPanel, isEnabled, setEnabled,
  getAutoInvite, setAutoInvite, clearAutoInvite,
  createPanel, updatePanel, deletePanel, markVerified,
} = require("../utils/bioPanel/store");
const { fetchProfile, checkProfile } = require("../utils/bioPanel/api");
const { createPermanentInvite } = require("../utils/bioPanel/autoInvite");
const {
  buildBioPanelHome, buildBioPanelEdit, setEditPage, stepEditPage, needsReport,
  buildTokenModal, buildTextModal, buildImageModal, buildHexModal, buildMainButtonModal,
  buildExtraButtonModal, buildPatternModal, DEFAULT_MESSAGE,
  buildRespTextModal, buildRespHexModal, buildRespImageModal, buildRespLinkModal, currentKind, setRespKind,
} = require("../ui/bioPanel/bioPanelConfig");
const responses = require("../utils/bioPanel/responses");
const {
  LIMITS, cleanText, stripEmoji, normalizePanel, savePanelImage, dropPanelAssets, renderPanel, publishPanel, syncPublished,
} = require("../utils/bioPanel/message");
const { LAYOUTS, COLORS, BUTTON_STYLES, PLACES, LIMITS: MSG_LIMITS, parseHex, dropSources, responseSources } = require("../utils/msgBuilder/store");
const { textLength, parseEmoji } = require("../utils/msgBuilder/render");

const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL = MessageFlags.Ephemeral;
const LINK = /^https?:\/\/\S+$/i;

const deny = (i, msg) => {
  const p = { content: msg, flags: EPHEMERAL };
  return i.replied || i.deferred ? i.followUp(p) : i.reply(p);
};

async function guard(interaction) {
  const ok = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
  if (!ok) await deny(interaction, "Apenas administradores podem configurar este sistema.");
  return ok;
}

async function homePanel(guildId) {
  const [panels, hasToken, enabled, autoInvite] = await Promise.all([
    getPanels(guildId),
    getToken(guildId).then((t) => t !== null),
    isEnabled(guildId),
    getAutoInvite(guildId),
  ]);
  return buildBioPanelHome(panels, hasToken, enabled, autoInvite);
}

const safeUpdate = (interaction, payload) => {
  if (interaction.deferred) return interaction.editReply(payload);
  return interaction.update(payload).catch(() => interaction.editReply(payload));
};

// Aviso só para quem clicou
const notice = (interaction, content) => deny(interaction, content);

// Salva uma resposta personalizada (parte do que já vale hoje + as mudanças). patch = null volta ao padrão.
async function saveResponse(guildId, raw, kind, patch) {
  const all = { ...(raw.responses ?? {}) };
  if (patch === null) delete all[kind];
  else all[kind] = { ...responses.getResponse(raw, kind), ...patch };
  await updatePanel(guildId, raw.panelId, { responses: all });
}

// Mostra a etapa aberta do editor (atualiza a mensagem do /menu)
async function showEditor(interaction, panelId, note = null) {
  const raw = await getPanel(interaction.guildId, panelId);
  if (!raw) return deny(interaction, "Painel não encontrado.");
  const report = needsReport(panelId) ? await renderPanel(raw) : null;
  return safeUpdate(interaction, { components: buildBioPanelEdit(raw, { report, note }), flags: V2 });
}

// Salva e, se o painel já estiver publicado, atualiza a mensagem do canal na hora.
// Devolve um aviso curto quando a mensagem publicada não pôde ser atualizada.
async function commit(interaction, panelId, patch, { sync = true } = {}) {
  await updatePanel(interaction.guildId, panelId, patch);
  if (!sync) return null;
  const updated = await getPanel(interaction.guildId, panelId);
  const result = await syncPublished(interaction.guild, updated);
  if (result === "invalid") return "-# A mensagem publicada não foi atualizada: o painel está incompleto. Veja o Resumo.";
  if (result === "missing") return "-# A mensagem publicada sumiu do canal. Publique de novo na etapa Envio.";
  if (result === "error") return "-# Não consegui atualizar a mensagem publicada. Confira as permissões do bot no canal.";
  return null;
}

// ─── Botões de config ───────────────────────────────────────────────────────

async function handleBioPanelButton(interaction) {
  if (!(await guard(interaction))) return;
  const { customId, guildId } = interaction;

  // Voltar para a lista de painéis
  if (customId === "bp_home") {
    return safeUpdate(interaction, { components: await homePanel(guildId), flags: V2 });
  }

  // Liga/desliga geral do sistema
  if (customId === "bp_toggle") {
    await setEnabled(guildId, !(await isEnabled(guildId)));
    return safeUpdate(interaction, { components: await homePanel(guildId), flags: V2 });
  }

  // Link fixo do servidor: gera um convite permanente e o usa como padrão. Clicar de novo troca por um novo.
  if (customId === "bp_invite_refresh") {
    await interaction.deferUpdate().catch(() => null);
    const current = await getAutoInvite(guildId);
    const made = await createPermanentInvite(interaction.guild, current?.code ?? null);
    if (!made.ok) return deny(interaction, made.reason);
    await setAutoInvite(guildId, { url: made.url, code: made.code });
    return safeUpdate(interaction, { components: await homePanel(guildId), flags: V2 });
  }
  if (customId === "bp_invite_clear") {
    const current = await getAutoInvite(guildId);
    await clearAutoInvite(guildId);
    if (current?.code) await interaction.guild.invites.delete(current.code, "Convite fixo desativado no painel Cargos por perfil").catch(() => null);
    return safeUpdate(interaction, { components: await homePanel(guildId), flags: V2 });
  }

  // Token
  if (customId === "bp_token_set") {
    return interaction.showModal(buildTokenModal());
  }
  if (customId === "bp_token_clear") {
    await clearToken(guildId);
    return safeUpdate(interaction, { components: await homePanel(guildId), flags: V2 });
  }

  // Criar painel
  if (customId === "bp_panel_create") {
    const panelId = await createPanel(guildId);
    setEditPage(panelId, "home");
    return showEditor(interaction, panelId);
  }

  // Editar painel existente (da lista)
  if (customId.startsWith("bp_panel_edit:")) {
    const panelId = customId.split(":")[1];
    const panel = await getPanel(guildId, panelId);
    if (!panel) return deny(interaction, "Painel não encontrado.");
    setEditPage(panelId, "home");
    return showEditor(interaction, panelId);
  }

  // Ações dentro de um painel: bp_panel:<panelId>:<ação>[:<arg>]
  if (customId.startsWith("bp_panel:")) {
    const [, panelId, action, arg] = customId.split(":");
    return handlePanelAction(interaction, guildId, panelId, action, arg);
  }
}

async function handlePanelAction(interaction, guildId, panelId, action, arg) {
  const raw = await getPanel(guildId, panelId);
  if (!raw) return deny(interaction, "Painel não encontrado.");
  const panel = normalizePanel(raw);

  // Prévia (só para quem clicou). O botão de verificar fica desativado.
  if (action === "preview") {
    const report = await renderPanel(raw, { withData: true, preview: true });
    if (!report.ready) return deny(interaction, `Ainda não dá para ver a prévia:\n${report.problems.map((p) => `-# ${p}`).join("\n")}`);
    return interaction.reply({ components: report.components, files: report.files, flags: V2 | EPHEMERAL });
  }

  // Navegação entre as etapas
  if (action === "go") {
    setEditPage(panelId, arg);
    return showEditor(interaction, panelId);
  }
  if (action === "go_private") {
    setRespKind(panelId, "private");
    setEditPage(panelId, "resp");
    return showEditor(interaction, panelId);
  }
  if (action === "prev" || action === "next") {
    stepEditPage(panelId, action === "next" ? 1 : -1);
    return showEditor(interaction, panelId);
  }

  // ----- modais -----
  if (action === "txt") return interaction.showModal(buildTextModal(panelId, raw));
  if (action === "img_main") return interaction.showModal(buildImageModal(panelId, "main"));
  if (action === "img_thumb") return interaction.showModal(buildImageModal(panelId, "thumb"));
  if (action === "hex") return interaction.showModal(buildHexModal(panelId, panel.color));
  if (action === "btn_main") return interaction.showModal(buildMainButtonModal(panelId, raw));
  if (action === "add_pattern") return interaction.showModal(buildPatternModal(panelId));

  // ----- respostas do botão Verificar -----
  if (action.startsWith("rp_")) return handleResponseAction(interaction, guildId, raw, panelId, action);
  if (action === "btn_add") {
    if (panel.extraButtons.length >= LIMITS.extraButtons) return deny(interaction, `Máximo de ${LIMITS.extraButtons} links extras.`);
    return interaction.showModal(buildExtraButtonModal(panelId, "new"));
  }
  if (action === "btn_edit") {
    const target = panel.extraButtons[Number(arg)];
    if (!target) return deny(interaction, "Esse link não existe mais.");
    return interaction.showModal(buildExtraButtonModal(panelId, Number(arg), target));
  }

  // ----- texto -----
  if (action === "txt_reset") {
    const note = await commit(interaction, panelId, { message: DEFAULT_MESSAGE });
    return showEditor(interaction, panelId, note);
  }

  if (action === "txt_clear") {
    const note = await commit(interaction, panelId, { message: "" });
    return showEditor(interaction, panelId, note);
  }

  // ----- mídia -----
  if (action === "img_xmain" || action === "img_xthumb") {
    const field = action === "img_xmain" ? "image" : "thumb";
    const old = panel[field];
    const note = await commit(interaction, panelId, { [field]: null });
    await dropSources([old]);
    return showEditor(interaction, panelId, note);
  }

  // ----- aparência -----
  if (action === "look_wide") {
    const note = await commit(interaction, panelId, { wide: !panel.wide });
    return showEditor(interaction, panelId, note);
  }

  // ----- botões -----
  if (action === "btn_del") {
    const list = [...panel.extraButtons];
    if (!list[Number(arg)]) return showEditor(interaction, panelId);
    list.splice(Number(arg), 1);
    const note = await commit(interaction, panelId, { extraButtons: list });
    return showEditor(interaction, panelId, note);
  }

  // ----- verificação -----
  const toggles = { toggle_bio: "checkBio", toggle_status: "checkStatus", toggle_pronouns: "checkPronouns", toggle_tag: "checkTag" };
  if (action === "toggle_private_mode") {
    await updatePanel(guildId, panelId, { privateMode: panel.privateMode === "fail" ? "notify" : "fail" });
    return showEditor(interaction, panelId);
  }
  if (action === "toggle_private_fallback") {
    await updatePanel(guildId, panelId, { privateFallback: panel.privateFallback === false });
    return showEditor(interaction, panelId);
  }
  if (toggles[action]) {
    await updatePanel(guildId, panelId, { [toggles[action]]: !panel[toggles[action]] });
    return showEditor(interaction, panelId);
  }

  // ----- publicação -----
  if (action === "publish") {
    if (!panel.channelId) return deny(interaction, "Escolha o canal antes de publicar.");
    await interaction.deferUpdate().catch(() => {});
    let result;
    try {
      result = await publishPanel(interaction.guild, raw);
    } catch (err) {
      console.error("[BIOPANEL] Falha ao publicar:", err?.message ?? err);
      result = { error: "Não consegui enviar a mensagem. Confira se o bot pode ver e escrever no canal." };
    }
    return showEditor(interaction, panelId, result.error ? `-# ${result.error}` : null);
  }

  // ----- exclusão (com confirmação) -----
  if (action === "del") {
    setEditPage(panelId, "del");
    return showEditor(interaction, panelId);
  }
  if (action === "del_no") {
    setEditPage(panelId, "send");
    return showEditor(interaction, panelId);
  }
  if (action === "del_ok") {
    if (panel.messageId && panel.channelId) {
      const ch = interaction.guild.channels.cache.get(panel.channelId);
      if (ch) await ch.messages.delete(panel.messageId).catch(() => {});
    }
    await dropPanelAssets(panel);
    await deletePanel(guildId, panelId);
    return safeUpdate(interaction, { components: await homePanel(guildId), flags: V2 });
  }
}

// ─── Respostas do botão Verificar (etapa Respostas do editor) ───────────────

async function handleResponseAction(interaction, guildId, raw, panelId, action) {
  const kind = currentKind(panelId);
  const resp = responses.getResponse(raw, kind);

  if (action === "rp_preview") return responses.preview(interaction, raw, kind);

  if (action === "rp_txt") return interaction.showModal(buildRespTextModal(panelId, kind, resp));
  if (action === "rp_hex") return interaction.showModal(buildRespHexModal(panelId, kind, resp.color));
  if (action === "rp_img") return interaction.showModal(buildRespImageModal(panelId, kind, "main"));
  if (action === "rp_thumb") return interaction.showModal(buildRespImageModal(panelId, kind, "thumb"));
  if (action === "rp_link_add") {
    if (resp.buttons.length >= MSG_LIMITS.respButtons) return deny(interaction, `Máximo de ${MSG_LIMITS.respButtons} links por resposta.`);
    return interaction.showModal(buildRespLinkModal(panelId, kind));
  }

  if (action === "rp_link_clear") {
    await saveResponse(guildId, raw, kind, { buttons: [] });
    return showEditor(interaction, panelId);
  }

  if (action === "rp_ximg" || action === "rp_xthumb") {
    const field = action === "rp_ximg" ? "image" : "thumb";
    const old = resp[field];
    await saveResponse(guildId, raw, kind, { [field]: null });
    await dropSources([old]);
    return showEditor(interaction, panelId);
  }

  if (action === "rp_reset") {
    await saveResponse(guildId, raw, kind, null);
    await dropSources(responseSources(raw.responses?.[kind]));
    return showEditor(interaction, panelId);
  }
}

// ─── Selects do editor (navegação, formato, cor, cargos, canal) ─────────────

async function handleBioPanelSelect(interaction) {
  if (!(await guard(interaction))) return;
  const { customId, guildId, values } = interaction;
  const [, panelId, action] = customId.split(":");
  const raw = await getPanel(guildId, panelId);
  if (!raw) return deny(interaction, "Painel não encontrado.");
  const panel = normalizePanel(raw);
  let note = null;

  if (action === "nav") {
    setEditPage(panelId, values[0]);
  } else if (action === "look_format") {
    if (!(values[0] in LAYOUTS)) return;
    note = await commit(interaction, panelId, { layout: values[0] });
  } else if (action === "look_color") {
    if (values[0] !== "none" && !(values[0] in COLORS)) return;
    note = await commit(interaction, panelId, { color: values[0] === "none" ? null : values[0] });
  } else if (action === "rm_pattern") {
    const list = [...panel.patterns];
    list.splice(Number(values[0]), 1);
    await updatePanel(guildId, panelId, { patterns: list });
  } else if (action === "give_roles" || action === "remove_roles") {
    const me = interaction.guild.members.me;
    const top = me?.roles?.highest?.position ?? 0;
    const ids = values.filter((rid) => {
      const r = interaction.guild.roles.cache.get(rid);
      return r && r.id !== interaction.guild.id && !r.managed && r.position < top;
    });
    await updatePanel(guildId, panelId, { [action === "give_roles" ? "giveRoles" : "removeRoles"]: ids });
  } else if (action === "resp_pick") {
    if (!(values[0] in responses.KINDS)) return;
    setRespKind(panelId, values[0]);
  } else if (action === "rp_mode") {
    if (!(values[0] in responses.MODES)) return;
    await saveResponse(guildId, raw, currentKind(panelId), { mode: values[0] });
  } else if (action === "rp_color") {
    if (values[0] !== "none" && !(values[0] in COLORS)) return;
    await saveResponse(guildId, raw, currentKind(panelId), { color: values[0] === "none" ? null : values[0] });
  } else if (action === "channel") {
    const newId = values[0] ?? null;
    if (newId !== panel.channelId) {
      // mudou ou limpou o canal: apaga a mensagem publicada no canal antigo
      if (panel.messageId && panel.channelId) {
        const old = interaction.guild.channels.cache.get(panel.channelId);
        if (old) await old.messages.delete(panel.messageId).catch(() => {});
      }
      await updatePanel(guildId, panelId, { channelId: newId, messageId: null });
    }
  } else {
    return;
  }

  return showEditor(interaction, panelId, note);
}

// ─── Modais de config ────────────────────────────────────────────────────────

function selectValue(interaction, id) {
  try {
    return interaction.fields.getStringSelectValues(id)?.[0] ?? null;
  } catch {
    return null;
  }
}

// Emoji de botão: só emoji do servidor (<:nome:id>). Devolve { value } ou { error }.
function customEmoji(raw) {
  const v = String(raw ?? "").trim();
  if (!v) return { value: "" };
  const parsed = parseEmoji(v);
  if (parsed.error || typeof parsed.value === "string") {
    return { error: "Emoji inválido. Use um emoji do servidor no formato <:nome:id>. Emoji unicode não é aceito." };
  }
  return { value: v };
}

async function handleBioPanelModal(interaction) {
  if (!(await guard(interaction))) return;
  const { customId, guildId, guild, user } = interaction;
  const [, type, panelId, arg, arg2] = customId.split(":"); // bp_modal:<tipo>[:<painel>[:<arg>[:<arg2>]]]

  if (type === "set_token") {
    const token = interaction.fields.getTextInputValue("token").trim();
    await setToken(guildId, token);
    return safeUpdate(interaction, { components: await homePanel(guildId), flags: V2 });
  }

  if (!panelId) return;
  const raw = await getPanel(guildId, panelId);
  if (!raw) return deny(interaction, "Painel não encontrado.");
  const panel = normalizePanel(raw);
  const field = (id) => interaction.fields.getTextInputValue(id).trim();

  await interaction.deferUpdate(); // baixar arquivo e atualizar a mensagem publicada pode demorar

  // ----- texto -----
  if (type === "txt") {
    const value = cleanText(interaction.fields.getTextInputValue("text"));
    if (!value) return notice(interaction, "Escreva algum texto.");
    if (textLength(value) > LIMITS.text) return notice(interaction, `O texto passa do limite de ${LIMITS.text} caracteres.`);
    const note = await commit(interaction, panelId, { message: value });
    return showEditor(interaction, panelId, note);
  }

  // ----- imagem principal / miniatura -----
  if (type === "img") {
    const file = interaction.fields.getUploadedFiles("file", false)?.first();
    const link = field("link");

    let source;
    if (file) {
      const saved = await savePanelImage({ guildId: guild.id, userId: user.id, file });
      if (saved.error) return notice(interaction, saved.error);
      source = saved.source;
    } else if (link) {
      if (!LINK.test(link)) return notice(interaction, "Link inválido. Use um link que começa com http:// ou https://");
      source = link;
    } else {
      return notice(interaction, "Envie uma imagem ou informe o link de uma imagem.");
    }

    const target = arg === "main" ? "image" : "thumb";
    const old = panel[target];
    const note = await commit(interaction, panelId, { [target]: source });
    if (old && old !== source) await dropSources([old]);
    return showEditor(interaction, panelId, note);
  }

  // ----- cor -----
  if (type === "hex") {
    const hex = parseHex(field("hex"));
    if (!hex) return notice(interaction, "Cor inválida. Use o formato #RRGGBB ou #RGB.");
    const note = await commit(interaction, panelId, { color: hex });
    return showEditor(interaction, panelId, note);
  }

  // ----- botão de verificação -----
  if (type === "btn_main") {
    const label = field("label");
    const emoji = customEmoji(field("emoji"));
    if (emoji.error) return notice(interaction, emoji.error);
    if (!label && !emoji.value) return notice(interaction, "O botão precisa de um texto ou de um emoji.");
    const style = selectValue(interaction, "style");
    const place = selectValue(interaction, "place");
    const note = await commit(interaction, panelId, {
      buttonLabel: label,
      buttonEmoji: emoji.value || null,
      buttonStyle: style in BUTTON_STYLES ? style : panel.buttonStyle,
      buttonPlace: place in PLACES ? place : panel.buttonPlace,
    });
    return showEditor(interaction, panelId, note);
  }

  // ----- link extra -----
  if (type === "btn_x") {
    const label = field("label");
    const url = field("url");
    const emoji = customEmoji(field("emoji"));
    const place = selectValue(interaction, "place");
    if (emoji.error) return notice(interaction, emoji.error);
    if (!LINK.test(url)) return notice(interaction, "Link inválido. Use um link que começa com http:// ou https://");
    if (!label && !emoji.value) return notice(interaction, "O botão precisa de um texto ou de um emoji.");

    const list = [...panel.extraButtons];
    const data = { label, url, emoji: emoji.value, place: place in PLACES ? place : "inside" };
    if (arg === "new") {
      if (list.length >= LIMITS.extraButtons) return notice(interaction, `Máximo de ${LIMITS.extraButtons} links extras.`);
      list.push(data);
    } else if (list[Number(arg)]) {
      list[Number(arg)] = data;
    } else {
      return showEditor(interaction, panelId);
    }
    const note = await commit(interaction, panelId, { extraButtons: list });
    return showEditor(interaction, panelId, note);
  }

  // ----- padrões -----
  if (type === "add_pattern") {
    const pattern = field("pattern");
    if (!pattern) return notice(interaction, "Escreva o padrão.");
    if (panel.patterns.includes(pattern)) return notice(interaction, "Esse padrão já existe.");
    if (panel.patterns.length >= LIMITS.patterns) return notice(interaction, `Máximo de ${LIMITS.patterns} padrões por painel.`);
    await updatePanel(guildId, panelId, { patterns: [...panel.patterns, pattern] });
    return showEditor(interaction, panelId);
  }

  // ----- respostas do botão Verificar -----
  if (type.startsWith("rp_")) {
    const kind = arg;
    if (!(kind in responses.KINDS)) return showEditor(interaction, panelId);
    const resp = responses.getResponse(raw, kind);

    if (type === "rp_txt") {
      const text = cleanText(interaction.fields.getTextInputValue("text"));
      if (!text) return notice(interaction, "Escreva algum texto.");
      await saveResponse(guildId, raw, kind, {
        text,
        title: stripEmoji(field("title")),
        footer: stripEmoji(field("footer")),
      });
      return showEditor(interaction, panelId);
    }

    if (type === "rp_hex") {
      const hex = parseHex(field("hex"));
      if (!hex) return notice(interaction, "Cor inválida. Use o formato #RRGGBB ou #RGB.");
      await saveResponse(guildId, raw, kind, { color: hex });
      return showEditor(interaction, panelId);
    }

    if (type === "rp_img") {
      const file = interaction.fields.getUploadedFiles("file", false)?.first();
      const link = field("link");
      let source;
      if (file) {
        const saved = await savePanelImage({ guildId: guild.id, userId: user.id, file });
        if (saved.error) return notice(interaction, saved.error);
        source = saved.source;
      } else if (link) {
        if (!LINK.test(link)) return notice(interaction, "Link inválido. Use um link que começa com http:// ou https://");
        source = link;
      } else {
        return notice(interaction, "Envie uma imagem ou informe o link de uma imagem.");
      }
      const target = arg2 === "main" ? "image" : "thumb";
      const old = resp[target];
      await saveResponse(guildId, raw, kind, { [target]: source });
      if (old && old !== source) await dropSources([old]);
      return showEditor(interaction, panelId);
    }

    if (type === "rp_link") {
      const label = field("label");
      const url = field("url");
      const emoji = customEmoji(field("emoji"));
      if (emoji.error) return notice(interaction, emoji.error);
      if (!LINK.test(url)) return notice(interaction, "Link inválido. Use um link que começa com http:// ou https://");
      if (!label && !emoji.value) return notice(interaction, "O botão precisa de um texto ou de um emoji.");
      if (resp.buttons.length >= MSG_LIMITS.respButtons) return notice(interaction, `Máximo de ${MSG_LIMITS.respButtons} links por resposta.`);
      await saveResponse(guildId, raw, kind, { buttons: [...resp.buttons, { label, url, emoji: emoji.value }] });
      return showEditor(interaction, panelId);
    }
  }
}

// ─── Verificação pública (botão no painel enviado no canal) ──────────────────

async function handleBioPanelVerify(interaction) {
  const { customId, guildId, member } = interaction;
  const panelId = customId.split(":")[1];

  await interaction.deferReply({ flags: EPHEMERAL });

  const [rawPanel, token, enabled, autoInvite] = await Promise.all([
    getPanel(guildId, panelId),
    getToken(guildId),
    isEnabled(guildId),
    getAutoInvite(guildId),
  ]);
  // O link fixo do servidor entra em toda verificação (checkProfile lê panel.autoInvite)
  const panel = rawPanel ? { ...rawPanel, autoInvite } : null;

  if (!panel) return interaction.editReply({ content: "Este painel não existe mais.", flags: EPHEMERAL });

  // Sistema desativado no /menu: ninguém consegue verificar
  if (!enabled) return interaction.editReply({ content: "A verificação de perfil está desativada no momento.", flags: EPHEMERAL });

  // Cargos de entrega configurados (ignora os que foram apagados do servidor)
  const giveRoles = (panel.giveRoles ?? []).filter((rid) => interaction.guild.roles.cache.has(rid));
  const reply = (kind, extra) => responses.answer(interaction, panel, kind, extra);

  // Sem cargo definido no painel: avisa em vez de verificar
  if (!giveRoles.length) return reply("norole");

  // Lê o perfil de quem clicou e confere os padrões do painel.
  // Devolve { kind } com a resposta de erro, ou { passed, details }.
  const checkMember = async () => {
    let unreadable = null;
    // O status vem da presença do membro (intent GuildPresences)
    const statusText = member.presence?.activities?.find((a) => a.type === 4)?.state ?? "";

    // A bio e os pronomes são lidos com a token da staff; status e tag não precisam dela
    let profile = { bio: "", pronouns: "", status: statusText };
    if (panel.checkBio || panel.checkPronouns) {
      if (!token) return { kind: "notoken" };
      const read = await fetchProfile(guildId, token, interaction.user.id, statusText);
      if (read?.error === "token") return { kind: "notoken" };
      if (read?.error) {
        // Bio/pronomes ilegíveis: se o painel permitir, status e tag ainda podem liberar o cargo
        unreadable = read.error;
      } else {
        profile = read;
      }
    }

    // Tag do servidor: vem do usuário (busca atualizada na API do Discord)
    if (panel.checkTag) {
      const user = await interaction.user.fetch(true).catch(() => interaction.user);
      const tag = user.primaryGuild;
      profile.tag = Boolean(tag && tag.identityGuildId === guildId && tag.identityEnabled !== false);
    }
    if (unreadable) {
      const others = Boolean(panel.checkStatus || panel.checkTag);
      if (panel.privateFallback !== false && others) {
        const alt = checkProfile(profile, { ...panel, checkBio: false, checkPronouns: false });
        if (alt.passed) return alt;
      }
      if (unreadable === "private") {
        return panel.privateMode === "fail"
          ? { passed: false, details: ["seu perfil está privado e não pôde ser lido"] }
          : { kind: "private" };
      }
      return { kind: "noprofile" };
    }
    return checkProfile(profile, panel);
  };

  // Quem já se verificou neste painel não ganha tudo de novo, mas se perdeu o cargo por qualquer motivo
  // o bot devolve. Só devolve se o perfil AINDA tiver o padrão: sem ele, o cargo não volta.
  if ((panel.verifiedUsers ?? []).includes(interaction.user.id)) {
    const missing = giveRoles.filter((rid) => !member.roles.cache.has(rid));
    if (!missing.length) return reply("already", { cargos: responses.mentions(giveRoles) });

    const result = await checkMember();
    if (result.kind) return reply(result.kind);
    if (!result.passed) return reply("fail", { detalhes: result.details.map((d) => `-# ${d}`).join("\n") });

    const restored = [];
    const failed = [];
    for (const roleId of missing) {
      try {
        await member.roles.add(roleId);
        restored.push(roleId);
      } catch {
        failed.push(roleId);
      }
    }

    // Nenhum voltou: avisa o erro. Se ao menos um voltou, é "cargo devolvido".
    const erros = failed.length ? `-# Não consegui devolver ${responses.mentions(failed)}. Avise a staff (confira a posição do cargo do bot).` : "";
    if (!restored.length) return reply("restored", { cargos: "nenhum", erros });
    return reply("restored", { cargos: responses.mentions(restored), erros });
  }

  const check = await checkMember();
  if (check.kind) return reply(check.kind);
  const { passed, details } = check;

  if (passed) {
    await markVerified(guildId, panelId, interaction.user.id);
    // Dar/remover cargos
    const errors = [];
    for (const roleId of giveRoles) {
      try { await member.roles.add(roleId); } catch { errors.push(`dar <@&${roleId}>`); }
    }
    for (const roleId of panel.removeRoles) {
      try { await member.roles.remove(roleId); } catch { errors.push(`remover <@&${roleId}>`); }
    }
    return reply("ok", {
      cargos: responses.mentions(giveRoles),
      erros: errors.length ? `-# Erro nos cargos: ${errors.join(", ")}` : "",
    });
  }

  return reply("fail", { detalhes: details.map((d) => `-# ${d}`).join("\n") });
}

module.exports = {
  handleBioPanelButton,
  handleBioPanelSelect,
  handleBioPanelModal,
  handleBioPanelVerify,
};
