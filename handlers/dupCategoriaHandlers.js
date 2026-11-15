const { MessageFlags } = require("discord.js");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");
const { getSession, deleteSession, resetSession, ALL_TYPES, ALL_ITEMS } = require("../utils/catClone/session");
const { reviewInfo, runClone, undoClone, categoryChildren } = require("../utils/catClone/clone");
const ui = require("../ui/dupCategoria");

const NO_MENTIONS = { parse: [] };
const EXPIRED = "Este painel expirou. Use `/duplicar-categoria` de novo.";

const isStaff = (member) => Boolean(member?.roles?.cache?.hasAny(...ALL_STAFF_ROLE_IDS));

// Descobre a sessão do componente. Só quem abriu o painel (e ainda é da equipe) pode mexer nele.
async function loadSession(interaction) {
  const [, sid, action, arg] = interaction.customId.split(":");
  const state = getSession(sid);
  const valid =
    state && state.userId === interaction.user.id && state.guildId === interaction.guildId && isStaff(interaction.member);

  if (!valid) {
    const payload = {
      components: ui.buildNotice(state ? "Você não pode usar este painel." : EXPIRED),
      allowedMentions: NO_MENTIONS,
    };
    if (interaction.isModalSubmit() && !interaction.isFromMessage()) {
      await interaction.reply({ ...payload, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    } else {
      await interaction.update(payload);
    }
    return null;
  }
  return { state, action, arg };
}

// Monta a página atual do painel
async function render(state, guild) {
  switch (state.page) {
    case "options":
      return ui.buildOptions(state, guild);
    case "channels":
      return ui.buildChannels(state, guild);
    case "naming":
      return ui.buildNaming(state);
    case "review":
      return ui.buildReview(state, guild, await reviewInfo(state, guild));
    case "done":
      return ui.buildDone(state);
    default:
      return ui.buildHome(state, guild);
  }
}

const show = async (interaction, state) =>
  interaction.update({ components: await render(state, interaction.guild), allowedMentions: NO_MENTIONS });

// A página só abre se a categoria ainda existir
function goTo(state, guild, page) {
  const needsSource = ["options", "channels", "naming", "review"].includes(page);
  if (needsSource && !guild.channels.cache.has(state.sourceId)) {
    state.page = "home";
    return "A categoria escolhida não existe mais. Escolha outra.";
  }
  state.page = page;
  return null;
}

// ---------- Botões ----------

async function handleDupButton(interaction) {
  const loaded = await loadSession(interaction);
  if (!loaded) return;
  const { state, action, arg } = loaded;
  const guild = interaction.guild;

  if (state.busy) {
    return interaction.deferUpdate().catch(() => {}); // duplicando agora: ignora cliques
  }

  switch (action) {
    case "go": {
      if (arg === "done" && !state.result) return show(interaction, state);
      const notice = goTo(state, guild, arg);
      if (notice) {
        return interaction.update({ components: ui.buildHome(state, guild, notice), allowedMentions: NO_MENTIONS });
      }
      if (arg === "channels") state.chPage = 0;
      return show(interaction, state);
    }

    case "close":
      deleteSession(state.sid);
      return interaction.update({ components: ui.buildNotice("Painel fechado."), allowedMentions: NO_MENTIONS });

    case "rename":
      return interaction.showModal(ui.buildRenameModal(state));

    // Lista de canais: páginas e marcar/desmarcar todos
    case "chprev":
    case "chnext": {
      const source = guild.channels.cache.get(state.sourceId);
      if (!source) return show(interaction, state);
      const pages = ui.channelPages(source);
      state.chPage = Math.min(Math.max(state.chPage + (action === "chnext" ? 1 : -1), 0), pages - 1);
      return show(interaction, state);
    }
    case "chall":
      state.excluded.clear();
      return show(interaction, state);
    case "chnone": {
      const source = guild.channels.cache.get(state.sourceId);
      if (source) for (const channel of categoryChildren(source)) state.excluded.add(channel.id);
      return show(interaction, state);
    }

    case "clone":
      return startClone(interaction, state);

    case "undo":
      if (!state.result?.created.length) return show(interaction, state);
      return interaction.update({ components: ui.buildUndoConfirm(state), allowedMentions: NO_MENTIONS });

    case "undoyes":
      return confirmUndo(interaction, state);

    case "again":
      resetSession(state);
      return show(interaction, state);

    default:
      return show(interaction, state);
  }
}

// Duplicação: confirma o clique, mostra o progresso na própria mensagem e termina com o resultado
async function startClone(interaction, state) {
  const guild = interaction.guild;
  const info = await reviewInfo(state, guild);
  if (info.blocking.length) return show(interaction, state);

  state.busy = true;
  state.page = "progress";
  const total = info.toCreate;
  await interaction.update({ components: ui.buildProgress(state, 0, total, "Preparando..."), allowedMentions: NO_MENTIONS });

  let last = 0;
  let pending = Promise.resolve();
  const onProgress = (done, all, name) => {
    const now = Date.now();
    if (done < all && now - last < 1500) return; // não passa de uma edição a cada ~1,5s
    last = now;
    pending = pending
      .then(() => interaction.editReply({ components: ui.buildProgress(state, done, all, name), allowedMentions: NO_MENTIONS }))
      .catch(() => {});
  };

  try {
    state.result = await runClone({ guild, state, executor: interaction.member, onProgress });
    state.page = "done";
    await pending;
    await interaction.editReply({ components: ui.buildDone(state), allowedMentions: NO_MENTIONS });
  } catch (err) {
    console.error("[duplicar-categoria] Erro ao duplicar:", err);
    state.page = "review";
    await pending;
    await interaction
      .editReply({ components: ui.buildError(state, `${err.message}\n-# O que já foi criado antes do erro continua no servidor.`), allowedMentions: NO_MENTIONS })
      .catch(() => {});
  } finally {
    state.busy = false;
  }
}

async function confirmUndo(interaction, state) {
  const created = state.result?.created ?? [];
  if (!created.length) return show(interaction, state);

  state.busy = true;
  await interaction.update({ components: ui.buildProgress(state, 0, 1, "Apagando a cópia..."), allowedMentions: NO_MENTIONS });
  try {
    const outcome = await undoClone(interaction.guild, created, interaction.member);
    state.result = null;
    state.page = "home";
    await interaction.editReply({ components: ui.buildUndone(state, outcome), allowedMentions: NO_MENTIONS });
  } catch (err) {
    console.error("[duplicar-categoria] Erro ao desfazer:", err);
    await interaction
      .editReply({ components: ui.buildError(state, "Não consegui apagar tudo. Confira a lista de canais.", "go:done"), allowedMentions: NO_MENTIONS })
      .catch(() => {});
  } finally {
    state.busy = false;
  }
}

// ---------- Selects ----------

async function handleDupSelect(interaction) {
  const loaded = await loadSession(interaction);
  if (!loaded) return;
  const { state, action } = loaded;
  const guild = interaction.guild;
  const values = interaction.values;

  if (state.busy) return interaction.deferUpdate().catch(() => {});

  switch (action) {
    case "cat": {
      const category = guild.channels.cache.get(values[0]);
      if (!category) return show(interaction, state);
      if (state.sourceId !== category.id) {
        state.sourceId = category.id;
        state.newName = `${category.name} (cópia)`.slice(0, 100);
        state.excluded.clear();
        state.chPage = 0;
        state.result = null;
      }
      state.page = "home";
      return show(interaction, state);
    }

    case "types":
      state.types = new Set(values.filter((v) => ALL_TYPES.includes(v)));
      return show(interaction, state);

    case "items":
      state.items = new Set(values.filter((v) => ALL_ITEMS.includes(v)));
      return show(interaction, state);

    case "chans": {
      const source = guild.channels.cache.get(state.sourceId);
      if (!source) return show(interaction, state);
      // Só mexe nos canais da página mostrada: o que está marcado entra, o resto sai
      for (const channel of ui.pageChannels(state, source).slice) {
        if (values.includes(channel.id)) state.excluded.delete(channel.id);
        else state.excluded.add(channel.id);
      }
      return show(interaction, state);
    }

    case "pos":
      if (["below", "above", "top", "end"].includes(values[0])) state.position = values[0];
      return show(interaction, state);

    case "copies":
      state.copies = Math.min(Math.max(Number(values[0]) || 1, 1), 5);
      return show(interaction, state);

    default:
      return show(interaction, state);
  }
}

// ---------- Modal: nome da cópia e troca de texto ----------

async function handleDupModal(interaction) {
  const loaded = await loadSession(interaction);
  if (!loaded) return;
  const { state } = loaded;

  const name = interaction.fields.getTextInputValue("name").trim();
  if (name) state.newName = name.slice(0, 100);
  state.find = interaction.fields.getTextInputValue("find").trim();
  state.replace = state.find ? interaction.fields.getTextInputValue("replace").trim() : "";
  state.page = "naming";

  const payload = { components: ui.buildNaming(state), allowedMentions: NO_MENTIONS };
  if (interaction.isFromMessage()) return interaction.update(payload);
  return interaction.reply({ ...payload, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
}

module.exports = { handleDupButton, handleDupSelect, handleDupModal };
