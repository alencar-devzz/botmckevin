const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const {
  getToken, setToken, clearToken, getPanels, getPanel,
  createPanel, updatePanel, deletePanel,
} = require("../utils/bioPanel/store");
const { fetchProfile, checkProfile } = require("../utils/bioPanel/api");
const {
  buildBioPanelHome, buildBioPanelEdit,
  buildTokenModal, buildTextModal, buildPatternModal, buildRemovePatternModal,
  buildRolesModal, buildChannelModal, buildButtonModal, buildPublicPanel,
} = require("../ui/bioPanel/bioPanelConfig");

const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL = MessageFlags.Ephemeral;

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

// ─── Botões de config ───────────────────────────────────────────────────────

async function handleBioPanelButton(interaction) {
  if (!(await guard(interaction))) return;
  const { customId, guildId } = interaction;

  // Voltar para home
  if (customId === "bp_home") {
    return interaction.update({ components: await homePanel(guildId), flags: V2 });
  }

  // Token
  if (customId === "bp_token_set") {
    return interaction.showModal(buildTokenModal());
  }
  if (customId === "bp_token_clear") {
    await clearToken(guildId);
    return interaction.update({ components: await homePanel(guildId), flags: V2 });
  }

  // Criar painel
  if (customId === "bp_panel_create") {
    const panelId = await createPanel(guildId);
    const panel = await getPanel(guildId, panelId);
    return interaction.update({ components: buildBioPanelEdit(panel), flags: V2 });
  }

  // Editar painel existente (da home)
  if (customId.startsWith("bp_panel_edit:")) {
    const panelId = customId.split(":")[1];
    const panel = await getPanel(guildId, panelId);
    if (!panel) return deny(interaction, "Painel não encontrado.");
    return interaction.update({ components: buildBioPanelEdit(panel), flags: V2 });
  }

  // Ações dentro de um painel — formato: bp_panel:<panelId>:<action>
  if (customId.startsWith("bp_panel:")) {
    const parts = customId.split(":");
    const panelId = parts[1];
    const action = parts[2];
    return handlePanelAction(interaction, guildId, panelId, action);
  }
}

async function handlePanelAction(interaction, guildId, panelId, action) {
  const panel = await getPanel(guildId, panelId);
  if (!panel) return deny(interaction, "Painel não encontrado.");

  // Toggles
  const toggles = { toggle_bio: "checkBio", toggle_status: "checkStatus", toggle_pronouns: "checkPronouns" };
  if (toggles[action]) {
    await updatePanel(guildId, panelId, { [toggles[action]]: !panel[toggles[action]] });
    const updated = await getPanel(guildId, panelId);
    return interaction.update({ components: buildBioPanelEdit(updated), flags: V2 });
  }

  // Modais de texto simples
  const textModals = {
    edit_title: ["Título do painel", "Título", panel.title],
    edit_desc: ["Descrição do painel", "Descrição", panel.description, true],
    edit_success: ["Texto de sucesso", "Texto mostrado ao verificar com sucesso", panel.successText, true],
    edit_fail: ["Texto de falha", "Texto mostrado ao falhar a verificação", panel.failText, true],
  };
  if (textModals[action]) {
    const [title, label, cur, long] = textModals[action];
    return interaction.showModal(buildTextModal(`bp_modal:${action}:${panelId}`, title, label, cur, long));
  }

  if (action === "edit_btn") return interaction.showModal(buildButtonModal(panelId, panel));
  if (action === "add_pattern") return interaction.showModal(buildPatternModal(panelId));
  if (action === "remove_pattern") return interaction.showModal(buildRemovePatternModal(panelId, panel.patterns));
  if (action === "edit_give_roles") return interaction.showModal(buildRolesModal(panelId, "give", panel.giveRoles));
  if (action === "edit_remove_roles") return interaction.showModal(buildRolesModal(panelId, "remove", panel.removeRoles));
  if (action === "set_channel") return interaction.showModal(buildChannelModal(panelId, panel.channelId));

  // Publicar painel no canal
  if (action === "publish") {
    if (!panel.channelId) return deny(interaction, "Defina o canal antes de publicar.");
    const channel = interaction.guild.channels.cache.get(panel.channelId);
    if (!channel) return deny(interaction, "Canal não encontrado. Verifique o ID.");
    await interaction.deferUpdate();
    // Apaga mensagem antiga se houver
    if (panel.messageId) {
      try { await channel.messages.delete(panel.messageId); } catch { /* já deletada */ }
    }
    const msg = await channel.send({ components: buildPublicPanel(panel), flags: V2 });
    await updatePanel(guildId, panelId, { messageId: msg.id, channelId: channel.id });
    const updated = await getPanel(guildId, panelId);
    return interaction.editReply({ components: buildBioPanelEdit(updated), flags: V2 });
  }

  // Excluir painel
  if (action === "delete_panel") {
    if (panel.messageId && panel.channelId) {
      const ch = interaction.guild.channels.cache.get(panel.channelId);
      if (ch) try { await ch.messages.delete(panel.messageId); } catch { /* ok */ }
    }
    await deletePanel(guildId, panelId);
    return interaction.update({ components: await homePanel(guildId), flags: V2 });
  }
}

// ─── Modais de config ────────────────────────────────────────────────────────

async function handleBioPanelModal(interaction) {
  if (!(await guard(interaction))) return;
  const { customId, guildId } = interaction;
  const parts = customId.split(":");
  // bp_modal:<type>[:<panelId>[:<field>]]
  const type = parts[1];

  if (type === "set_token") {
    const token = interaction.fields.getTextInputValue("token").trim();
    await setToken(guildId, token);
    return interaction.update({ components: await homePanel(guildId), flags: V2 });
  }

  const panelId = parts[2];
  if (!panelId) return;

  const textFields = {
    edit_title: ["title"],
    edit_desc: ["description"],
    edit_success: ["successText"],
    edit_fail: ["failText"],
  };
  if (textFields[type]) {
    const [field] = textFields[type];
    const value = interaction.fields.getTextInputValue("value").trim();
    await updatePanel(guildId, panelId, { [field]: value });
    const panel = await getPanel(guildId, panelId);
    return interaction.update({ components: buildBioPanelEdit(panel), flags: V2 });
  }

  if (type === "button") {
    const label = interaction.fields.getTextInputValue("label").trim();
    const emoji = interaction.fields.getTextInputValue("emoji").trim() || null;
    await updatePanel(guildId, panelId, { buttonLabel: label, buttonEmoji: emoji });
    const panel = await getPanel(guildId, panelId);
    return interaction.update({ components: buildBioPanelEdit(panel), flags: V2 });
  }

  if (type === "add_pattern") {
    const pattern = interaction.fields.getTextInputValue("pattern").trim();
    const panel = await getPanel(guildId, panelId);
    if (panel.patterns.includes(pattern)) return deny(interaction, "Esse padrão já existe.");
    if (panel.patterns.length >= 10) return deny(interaction, "Máximo de 10 padrões por painel.");
    await updatePanel(guildId, panelId, { patterns: [...panel.patterns, pattern] });
    const updated = await getPanel(guildId, panelId);
    return interaction.update({ components: buildBioPanelEdit(updated), flags: V2 });
  }

  if (type === "remove_pattern") {
    const idx = parseInt(interaction.fields.getTextInputValue("index").trim(), 10) - 1;
    const panel = await getPanel(guildId, panelId);
    if (isNaN(idx) || idx < 0 || idx >= panel.patterns.length)
      return deny(interaction, `Número inválido. Use de 1 a ${panel.patterns.length}.`);
    const newPatterns = [...panel.patterns];
    newPatterns.splice(idx, 1);
    await updatePanel(guildId, panelId, { patterns: newPatterns });
    const updated = await getPanel(guildId, panelId);
    return interaction.update({ components: buildBioPanelEdit(updated), flags: V2 });
  }

  if (type === "roles") {
    const field = parts[3]; // give | remove
    const raw = interaction.fields.getTextInputValue("roles");
    const ids = raw.split(",").map((s) => s.trim()).filter((s) => /^\d{15,25}$/.test(s));
    const key = field === "give" ? "giveRoles" : "removeRoles";
    await updatePanel(guildId, panelId, { [key]: ids });
    const panel = await getPanel(guildId, panelId);
    return interaction.update({ components: buildBioPanelEdit(panel), flags: V2 });
  }

  if (type === "channel") {
    const channelId = interaction.fields.getTextInputValue("channelId").trim();
    const ch = interaction.guild.channels.cache.get(channelId);
    if (!ch) return deny(interaction, "Canal não encontrado. Verifique o ID.");
    await updatePanel(guildId, panelId, { channelId });
    const panel = await getPanel(guildId, panelId);
    return interaction.update({ components: buildBioPanelEdit(panel), flags: V2 });
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
      content: "⚠️ O administrador ainda não definiu a token de acesso. A verificação está indisponível.",
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
      content: "❌ Sua token é inválida ou expirou. Redefina-a e tente novamente.",
      flags: EPHEMERAL,
    });
  }

  const { passed, details } = checkProfile(profile, panel);

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
    return interaction.editReply({ content: panel.successText + extra, flags: EPHEMERAL });
  }

  return interaction.editReply({
    content: `${panel.failText}\n-# ${details.join("\n-# ")}`,
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
  return interaction.reply({ content: "✅ Sua token foi salva com criptografia. Agora clique em **Verificar**.", flags: EPHEMERAL });
}

module.exports = {
  handleBioPanelButton,
  handleBioPanelModal,
  handleBioPanelVerify,
  handleBioPanelUserToken,
  handleBioPanelUserTokenModal,
};
