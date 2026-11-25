const { MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder } = require("discord.js");
const { getDmMassaSession, deleteDmMassaSession, createDmMassaSession } = require("../utils/dmMassa/session");
const { fetchUserGuilds, fetchGuildMemberIds, sendDm, USER_TOKEN } = require("../utils/dmMassa/userApi");
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

async function _runDisparo(interaction, state) {
  const { guildId, message, limit } = state;

  let memberIds;
  try {
    memberIds = await fetchGuildMemberIds(guildId, limit ?? 1000);
  } catch (err) {
    console.error("[DMMASSA] Erro ao buscar membros:", err);
    memberIds = [];
  }

  state.total = memberIds.length;
  state.sent = 0;
  state.failed = 0;

  if (memberIds.length === 0) {
    state.phase = "done";
    interaction.editReply({
      components: buildDmMassaError(state, "Nenhum membro encontrado no servidor ou token sem acesso."),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    }).catch(() => {});
    return;
  }

  // Envia em lotes de 5 com pausa para evitar rate limit
  const BATCH = 5;
  const DELAY_MS = 1200;

  for (let i = 0; i < memberIds.length; i += BATCH) {
    const batch = memberIds.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (uid) => {
        const ok = await sendDm(uid, message);
        if (ok) state.sent++;
        else state.failed++;
      })
    );

    // Atualiza a mensagem de progresso a cada lote
    interaction.editReply({
      components: buildDmMassaProgress(state),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    }).catch(() => {});

    if (i + BATCH < memberIds.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
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
