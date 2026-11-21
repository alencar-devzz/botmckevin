const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const {
  getToken, setToken, clearToken, getPanels, getPanel,
  createPanel, updatePanel, deletePanel,
} = require("../utils/bioPanel/store");
const { fetchProfile, checkProfile } = require("../utils/bioPanel/api");
const {
  buildBioPanelHome, buildBioPanelEdit, setEditPage, stepEditPage, needsReport, stripEmoji,
  buildTokenModal, buildTextModal, buildImageModal, buildHexModal, buildMainButtonModal,
  buildExtraButtonModal, buildPatternModal, buildReplyModal, DEFAULT_MESSAGE,
} = require("../ui/bioPanel/bioPanelConfig");
const {
  LIMITS, cleanText, normalizePanel, savePanelImage, dropPanelAssets, renderPanel, publishPanel, syncPublished,
} = require("../utils/bioPanel/message");
const { LAYOUTS, COLORS, BUTTON_STYLES, PLACES, parseHex, dropSources } = require("../utils/msgBuilder/store");
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
  const [panels, hasToken] = await Promise.all([
    getPanels(guildId),
    getToken(guildId).then((t) => t !== null),
  ]);
  return buildBioPanelHome(panels, hasToken);
}

const safeUpdate = (interaction, payload) => {
  if (interaction.deferred) return interaction.editReply(payload);
  return interaction.update(payload).catch(() => interaction.editReply(payload));
};

// Aviso só para quem clicou
const notice = (interaction, content) => deny(interaction, content);

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
  if (action === "resp_ok") return interaction.showModal(buildReplyModal(panelId, "ok", panel.successText));
  if (action === "resp_fail") return interaction.showModal(buildReplyModal(panelId, "fail", panel.failText));
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
  const toggles = { toggle_bio: "checkBio", toggle_status: "checkStatus", toggle_pronouns: "checkPronouns" };
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
  const [, type, panelId, arg] = customId.split(":"); // bp_modal:<tipo>[:<painel>[:<arg>]]

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

  // ----- respostas -----
  if (type === "resp_ok" || type === "resp_fail") {
    const value = cleanText(interaction.fields.getTextInputValue("text"));
    if (!value) return notice(interaction, "Escreva algum texto.");
    await updatePanel(guildId, panelId, { [type === "resp_ok" ? "successText" : "failText"]: value });
    return showEditor(interaction, panelId);
  }
}

// ─── Verificação pública (botão no painel enviado no canal) ──────────────────

async function handleBioPanelVerify(interaction) {
  const { customId, guildId, member } = interaction;
  const panelId = customId.split(":")[1];

  await interaction.deferReply({ flags: EPHEMERAL });

  const [panel, token] = await Promise.all([
    getPanel(guildId, panelId),
    getToken(guildId),
  ]);

  if (!panel) return interaction.editReply({ content: "Este painel não existe mais.", flags: EPHEMERAL });

  if (!token) {
    return interaction.editReply({
      content: "<:alert:1569387419634106448> O administrador ainda não definiu a token de acesso. A verificação está indisponível.",
      flags: EPHEMERAL,
    });
  }

  // Busca o perfil do usuário com a token DELE armazenada
  // Neste fluxo o usuário é quem clica: a token no banco é a do usuário.
  // Se o servidor usa uma token própria (do admin ou de um bot auxiliar),
  // a chamada é /users/<userId> — mas a API do Discord v10 não expõe bio
  // de outros usuários sem o próprio token. Por isso o campo armazenado
  // é a token do USUÁRIO que quer se verificar.
  // Para isso, antes de verificar ele precisa ter definido a própria token.
  // A token guardada no banco é POR USUÁRIO: o guildId aqui serve só para
  // validar que o painel pertence ao servidor.

  // Fluxo: cada usuário define sua própria token (via botão no painel público).
  // A token fica em BioPanelUserToken (modelo separado, por userId).

  const userToken = await getUserToken(interaction.user.id);
  if (!userToken) {
    return interaction.editReply({
      content: `Você ainda não definiu sua token pessoal.\nUse o botão **Definir minha token** no painel para configurar antes de verificar.`,
      flags: EPHEMERAL,
    });
  }

  const profile = await fetchProfile(null, userToken);
  if (!profile) {
    // Token inválida: apaga do banco
    await clearUserToken(interaction.user.id);
    return interaction.editReply({
      content: "<:alert:1569387419634106448> Sua token é inválida ou expirou. Redefina-a e tente novamente.",
      flags: EPHEMERAL,
    });
  }

  const { passed, details } = checkProfile(profile, panel);
  // {usuario} vira a menção de quem clicou; emoji unicode não entra nas respostas
  const fill = (t) => stripEmoji(t).replaceAll("{usuario}", `<@${interaction.user.id}>`);

  if (passed) {
    // Dar/remover cargos
    const errors = [];
    for (const roleId of panel.giveRoles) {
      try { await member.roles.add(roleId); } catch { errors.push(`dar <@&${roleId}>`); }
    }
    for (const roleId of panel.removeRoles) {
      try { await member.roles.remove(roleId); } catch { errors.push(`remover <@&${roleId}>`); }
    }
    const extra = errors.length ? `\n-# Erro nos cargos: ${errors.join(", ")}` : "";
    return interaction.editReply({ content: fill(panel.successText) + extra, flags: EPHEMERAL });
  }

  return interaction.editReply({
    content: `${fill(panel.failText)}\n-# ${details.join("\n-# ")}`,
    flags: EPHEMERAL,
  });
}

// ─── Token por usuário (modelo separado) ─────────────────────────────────────

const BioPanelUserToken = require("../database/models/BioPanelUserToken");
const { encrypt: enc, decrypt: dec } = require("../utils/bioPanel/crypto");

async function getUserToken(userId) {
  const doc = await BioPanelUserToken.findOne({ userId }).lean();
  if (!doc?.tokenEnc) return null;
  return dec(doc.tokenEnc);
}
async function setUserToken(userId, plain) {
  await BioPanelUserToken.findOneAndUpdate(
    { userId },
    { $set: { tokenEnc: enc(plain.trim()) } },
    { upsert: true }
  );
}
async function clearUserToken(userId) {
  await BioPanelUserToken.findOneAndUpdate({ userId }, { $set: { tokenEnc: null } }, { upsert: true });
}

// Botão "Definir minha token" no painel público
async function handleBioPanelUserToken(interaction) {
  const { customId } = interaction;
  if (customId === "bp_user_token_set") {
    return interaction.showModal(
      buildTokenModal() // reutiliza o mesmo modal visual
    );
  }
}

// Modal da token do usuário (vindo do painel público)
async function handleBioPanelUserTokenModal(interaction) {
  const token = interaction.fields.getTextInputValue("token").trim();
  await setUserToken(interaction.user.id, token);
  return interaction.reply({ content: "<:check:1571598243526348850> Sua token foi salva com criptografia. Agora clique em **Verificar**.", flags: EPHEMERAL });
}

module.exports = {
  handleBioPanelButton,
  handleBioPanelSelect,
  handleBioPanelModal,
  handleBioPanelVerify,
  handleBioPanelUserToken,
  handleBioPanelUserTokenModal,
};
