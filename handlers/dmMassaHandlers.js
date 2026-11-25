const { MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder } = require("discord.js");
const { getDmMassaSession, deleteDmMassaSession, createDmMassaSession } = require("../utils/dmMassa/session");
const {
  fetchUserGuilds,
  fetchGuildMemberIds,
  fetchExistingDmChannels,
  sendToChannel,
  sleep,
  jitter,
  USER_TOKEN,
} = require("../utils/dmMassa/userApi");
const {
  buildDmMassaHome,
  buildDmMassaServers,
  buildDmMassaConfirm,
  buildDmMassaProgress,
  buildDmMassaDone,
  buildDmMassaError,
} = require("../ui/dmMassa");

// ---------- helpers ----------

const V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

async function update(interaction, components) {
  return interaction.update({
    components,
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
}

function parseSid(customId) {
  // dmm:<sid>:<action>
  const parts = customId.split(":");
  return { sid: parts[1], action: parts.slice(2).join(":") };
}

// ---------- Botoes ----------

async function handleDmMassaButton(interaction) {
  const { sid, action } = parseSid(interaction.customId);
  const state = getDmMassaSession(sid);

  if (!state) {
    return interaction.update({
      components: [
        {
          type: 17,
          components: [{ type: 10, content: "Esta sessao expirou. Use /dmmassa novamente." }],
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  }

  // Abre o modal de redacao da mensagem
  if (action === "open_modal") {
    const modal = new ModalBuilder()
      .setCustomId(`dmm_modal:${sid}:message`)
      .setTitle("Redigir mensagem")
      .addLabelComponents(
        new LabelBuilder()
          .setLabel("Mensagem que sera enviada nas DMs")
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId("msg")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMaxLength(2000)
              .setPlaceholder("Digite a mensagem aqui...")
              .setValue(state.message ?? "")
          )
      );
    return interaction.showModal(modal);
  }

  // Cancelar — encerra a sessao
  if (action === "cancel") {
    deleteDmMassaSession(sid);
    const fakeState = { sid };
    return interaction.update({
      components: [
        {
          type: 17,
          components: [{ type: 10, content: "Operacao cancelada." }],
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  }

  // Abre modal para definir limite de DMs
  if (action === "set_limit") {
    const modal = new ModalBuilder()
      .setCustomId(`dmm_modal:${sid}:limit`)
      .setTitle("Limite de DMs")
      .addLabelComponents(
        new LabelBuilder()
          .setLabel("Quantidade maxima de DMs a enviar")
          .setDescription("Deixe vazio para enviar para todos os membros.")
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId("qty")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(5)
              .setPlaceholder("Ex: 50")
              .setValue(state.limit ? String(state.limit) : "")
          )
      );
    return interaction.showModal(modal);
  }

  // Iniciar o disparo
  if (action === "start") {
    if (!USER_TOKEN) {
      return update(interaction, buildDmMassaError(state, "USER_TOKEN nao esta configurada no ambiente."));
    }
    if (!state.message) {
      return update(interaction, buildDmMassaError(state, "Nenhuma mensagem redigida."));
    }
    if (!state.guildId) {
      return update(interaction, buildDmMassaError(state, "Nenhum servidor selecionado."));
    }

    // Busca membros e inicia o envio em background
    state.phase = "sending";
    await update(interaction, buildDmMassaProgress(state));
    _runDisparo(interaction, state);
    return;
  }

  // Reiniciar — cria nova sessao com mesmo userId
  if (action === "restart") {
    deleteDmMassaSession(sid);
    const newState = createDmMassaSession(state.userId);
    return interaction.update({
      components: buildDmMassaHome(newState),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
  }
}

// ---------- Selects ----------

async function handleDmMassaSelect(interaction) {
  const { sid, action } = parseSid(interaction.customId);
  const state = getDmMassaSession(sid);

  if (!state) {
    return interaction.update({
      components: [
        {
          type: 17,
          components: [{ type: 10, content: "Esta sessao expirou. Use /dmmassa novamente." }],
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  }

  if (action === "pick_guild") {
    const guildId = interaction.values[0];
    if (guildId === "none") return interaction.deferUpdate();

    // Busca nome do servidor da lista em cache (nao temos acesso direto aqui, usamos o label)
    const selected = interaction.component?.options?.find((o) => o.value === guildId);
    state.guildId = guildId;
    state.guildName = selected?.label ?? guildId;
    state.phase = "confirm";

    return update(interaction, buildDmMassaConfirm(state));
  }
}

// ---------- Modais ----------

async function handleDmMassaModal(interaction) {
  const parts = interaction.customId.split(":");
  // dmm_modal:<sid>:<type>
  const sid = parts[1];
  const type = parts[2];
  const state = getDmMassaSession(sid);

  if (!state) {
    return interaction.reply({
      content: "Esta sessao expirou. Use /dmmassa novamente.",
      flags: MessageFlags.Ephemeral,
    });
  }

  // Modal de mensagem
  if (type === "message") {
    const msg = interaction.fields.getTextInputValue("msg").trim();
    if (!msg) {
      return interaction.reply({ content: "A mensagem nao pode estar vazia.", flags: MessageFlags.Ephemeral });
    }
    state.message = msg;

    // Busca servidores da token para montar o select
    let guilds = [];
    try {
      guilds = await fetchUserGuilds();
    } catch {
      guilds = [];
    }

    return interaction.update({
      components: buildDmMassaServers(state, guilds),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
  }

  // Modal de limite
  if (type === "limit") {
    const raw = interaction.fields.getTextInputValue("qty").trim();
    if (raw === "") {
      state.limit = null;
    } else {
      const n = parseInt(raw, 10);
      state.limit = isNaN(n) || n < 1 ? null : n;
    }
    return interaction.update({
      components: buildDmMassaConfirm(state),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
  }
}

// ---------- Disparo em background ----------

// Atualiza o progresso na mensagem efemera sem explodir se a interaction expirou
function _editProgress(interaction, state) {
  interaction.editReply({
    components: buildDmMassaProgress(state),
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  }).catch(() => {});
}

async function _runDisparo(interaction, state) {
  const { guildId, message, limit } = state;

  // --- 1. Busca membros do servidor ---
  let memberIds;
  try {
    memberIds = await fetchGuildMemberIds(guildId, limit ?? 1000);
  } catch (err) {
    console.error("[DMMASSA] Erro ao buscar membros:", err);
    memberIds = [];
  }

  if (memberIds.length === 0) {
    state.phase = "done";
    interaction.editReply({
      components: buildDmMassaError(state, "Nenhum membro encontrado no servidor ou token sem acesso."),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    }).catch(() => {});
    return;
  }

  // --- 2. Busca canais de DM ja existentes (NAO abre canal novo) ---
  let dmChannels;
  try {
    dmChannels = await fetchExistingDmChannels();
  } catch {
    dmChannels = new Map();
  }

  // Filtra: so envia pra quem ja tem DM aberta com a conta
  const targets = memberIds.filter((uid) => dmChannels.has(uid));

  state.total = targets.length;
  state.sent = 0;
  state.failed = 0;
  state.skipped = (memberIds.length - targets.length); // sem DM aberta

  if (targets.length === 0) {
    state.phase = "done";
    interaction.editReply({
      components: buildDmMassaError(
        state,
        `Nenhum dos ${memberIds.length} membros tem uma DM aberta com a conta configurada.\n` +
        `-# So e possivel enviar para pessoas que ja conversaram com a conta antes.`
      ),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    }).catch(() => {});
    return;
  }

  _editProgress(interaction, state);

  // --- 3. Envio 1 por vez, delay com jitter, backoff em ratelimit ---

  // Delay base entre mensagens: 4s a 9s (aleatorio por envio)
  const BASE_DELAY_MIN = 4000;
  const BASE_DELAY_MAX = 9000;

  // Contagem para atualizar progresso a cada N envios
  const PROGRESS_EVERY = 3;

  for (let i = 0; i < targets.length; i++) {
    const uid = targets[i];
    const channelId = dmChannels.get(uid);

    // Tenta enviar
    let result = await sendToChannel(channelId, message);

    // Backoff progressivo em caso de ratelimit (nao deveria chegar aqui, userApi ja trata 429,
    // mas por seguranca aguardamos mais antes de continuar)
    if (result === "ratelimit") {
      console.warn("[DMMASSA] Ratelimit secundario, aguardando 20s...");
      await sleep(20000 + jitter(5000));
      result = await sendToChannel(channelId, message);
    }

    if (result === "ok") state.sent++;
    else state.failed++;

    // Atualiza progresso periodicamente
    if ((i + 1) % PROGRESS_EVERY === 0 || i === targets.length - 1) {
      _editProgress(interaction, state);
    }

    // Delay entre mensagens (nao aplica apos o ultimo)
    if (i < targets.length - 1) {
      const delay =
        BASE_DELAY_MIN +
        Math.floor(Math.random() * (BASE_DELAY_MAX - BASE_DELAY_MIN)) +
        jitter(1000);
      await sleep(delay);
    }
  }

  state.phase = "done";
  interaction.editReply({
    components: buildDmMassaDone(state),
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  }).catch(() => {});
}

module.exports = { handleDmMassaButton, handleDmMassaSelect, handleDmMassaModal };
