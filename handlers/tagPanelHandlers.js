const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const {
  getPanels, getPanel, isEnabled, setEnabled,
  createPanel, updatePanel, deletePanel,
} = require("../utils/tagPanel/store");
const {
  buildTagPanelHome, buildTagPanelEdit, setEditPage, stepEditPage, needsReport,
  buildTextModal, buildImageModal, buildHexModal, buildMainButtonModal,
  buildExtraButtonModal, DEFAULT_MESSAGE,
  buildRespTextModal, buildRespHexModal, buildRespImageModal, buildRespLinkModal, currentKind, setRespKind,
} = require("../ui/tagPanel/tagPanelConfig");
const responses = require("../utils/tagPanel/responses");
const {
  LIMITS, cleanText, stripEmoji, normalizePanel, savePanelImage, dropPanelAssets, renderPanel, publishPanel, syncPublished,
} = require("../utils/tagPanel/message");
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
  const [panels, enabled] = await Promise.all([getPanels(guildId), isEnabled(guildId)]);
  return buildTagPanelHome(panels, enabled);
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
  return safeUpdate(interaction, { components: buildTagPanelEdit(raw, { report, note }), flags: V2 });
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

async function handleTagPanelButton(interaction) {
  if (!(await guard(interaction))) return;
  const { customId, guildId } = interaction;

  // Voltar para a lista de painéis
  if (customId === "tp_home") {
    return safeUpdate(interaction, { components: await homePanel(guildId), flags: V2 });
  }

  // Liga/desliga geral do sistema
  if (customId === "tp_toggle") {
    await setEnabled(guildId, !(await isEnabled(guildId)));
    return safeUpdate(interaction, { components: await homePanel(guildId), flags: V2 });
  }

  // Criar painel
  if (customId === "tp_panel_create") {
    const panelId = await createPanel(guildId);
    setEditPage(panelId, "home");
    return showEditor(interaction, panelId);
  }

  // Editar painel existente (da lista)
  if (customId.startsWith("tp_panel_edit:")) {
    const panelId = customId.split(":")[1];
    const panel = await getPanel(guildId, panelId);
    if (!panel) return deny(interaction, "Painel não encontrado.");
    setEditPage(panelId, "home");
    return showEditor(interaction, panelId);
  }

  // Ações dentro de um painel: tp_panel:<panelId>:<ação>[:<arg>]
  if (customId.startsWith("tp_panel:")) {
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

async function handleTagPanelSelect(interaction) {
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

async function handleTagPanelModal(interaction) {
  if (!(await guard(interaction))) return;
  const { customId, guildId, guild, user } = interaction;
  const [, type, panelId, arg, arg2] = customId.split(":"); // tp_modal:<tipo>[:<painel>[:<arg>[:<arg2>]]]

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

async function handleTagPanelVerify(interaction) {
  const { customId, guildId, member } = interaction;
  const panelId = customId.split(":")[1];

  await interaction.deferReply({ flags: EPHEMERAL });

  const [panel, enabled] = await Promise.all([getPanel(guildId, panelId), isEnabled(guildId)]);
  if (!panel) return interaction.editReply({ content: "Este painel não existe mais.", flags: EPHEMERAL });

  // Sistema desativado no /menu: ninguém recebe cargo
  if (!enabled) return interaction.editReply({ content: "O cargo por tag está desativado no momento.", flags: EPHEMERAL });

  // Cargos de entrega configurados (ignora os que foram apagados do servidor)
  const giveRoles = (panel.giveRoles ?? []).filter((rid) => interaction.guild.roles.cache.has(rid));
  const reply = (kind, extra) => responses.answer(interaction, panel, kind, extra);

  // Sem cargo definido no painel: avisa em vez de verificar
  if (!giveRoles.length) return reply("norole");

  // Tag do servidor: lida do usuário (busca atualizada na API do Discord). Desligada no perfil = não vale.
  const user = await interaction.user.fetch(true).catch(() => interaction.user);
  const guildTag = user.primaryGuild;
  const hasTag = Boolean(guildTag && guildTag.identityGuildId === guildId && guildTag.identityEnabled !== false);
  if (!hasTag) return reply("fail", { detalhes: "-# Tag do servidor não encontrada no seu perfil." });

  // Já tem todos os cargos (e nada a remover): só avisa
  const missing = giveRoles.filter((rid) => !member.roles.cache.has(rid));
  const toRemove = (panel.removeRoles ?? []).filter((rid) => member.roles.cache.has(rid));
  if (!missing.length && !toRemove.length) return reply("already", { cargos: responses.mentions(giveRoles) });

  // Dá os cargos que faltam e tira os que o painel manda remover
  const errors = [];
  for (const roleId of missing) {
    try { await member.roles.add(roleId); } catch { errors.push(`dar <@&${roleId}>`); }
  }
  for (const roleId of toRemove) {
    try { await member.roles.remove(roleId); } catch { errors.push(`remover <@&${roleId}>`); }
  }
  return reply("ok", {
    cargos: responses.mentions(giveRoles),
    erros: errors.length ? `-# Erro nos cargos: ${errors.join(", ")}` : "",
  });
}

module.exports = {
  handleTagPanelButton,
  handleTagPanelSelect,
  handleTagPanelModal,
  handleTagPanelVerify,
};
