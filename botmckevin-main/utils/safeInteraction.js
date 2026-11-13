const { MessageFlags, MessageFlagsBitField } = require("discord.js");
const { ContainerBuilder, TextDisplayBuilder } = require("discord.js");

// O Discord só dá 3 segundos para a primeira resposta de uma interação. Depois de confirmada
// (deferUpdate/deferReply), o token vale 15 minutos. O painel do groles já funcionava assim; este
// arquivo dá o mesmo comportamento a TODOS os botões do bot:
//   1. Se o botão ainda não respondeu logo no clique, o bot confirma sozinho (deferUpdate),
//      ganhando até 15 minutos para terminar o trabalho (banco lento, API do Discord, etc.).
//   2. Depois disso, update/reply/editReply/followUp do próprio handler continuam funcionando
//      (são convertidos para o que o Discord aceita), então nenhum handler precisa mudar.
//   3. Se o handler falhar, a pessoa recebe um aviso em vez de "Esta interação falhou".
// 0 = confirma logo no clique (igual ao painel groles). Só handlers que respondem de imediato escapam disso.
const AUTO_DEFER_MS = Number(process.env.BOTAO_CONFIRMA_MS ?? 0);
const EPHEMERAL = MessageFlags.Ephemeral;

// Botões que abrem modal ficam FORA da proteção: o Discord só aceita o modal como primeira resposta,
// então eles continuam respondendo direto (sem confirmação automática). Ao criar um botão novo que
// abre modal, adicione o customId aqui.
const MODAL_BUTTONS = [
  /^ar:al:(domAllow|domBlock|wrap|guilds|msg)$/, // anti-link
  /^apar_(avatar_set|banner_set|prefixo_set|nome_set|status_cfg|status_text)$/, // aparência
  /^bumpcfg_(timing|text|embed|media)(:|$)/, // bump
  /^chcfg_edit(:|$)/, // calls (configuração)
  /^cpn_limit$/, // painel da call: limite de pessoas
  /^clcfg_edit(:|$)/, // comando cl
  /^msg:(txt:edit|med:(main|thumb)|look:hex|aud:set)$/, // criador de mensagens
  /^msg:btn:(add|edit)(:|$)/,
  /^msg:rsp:(txt|img|thumb|hex)(:|$)/,
  /^msg:rbtn:(add|edit)(:|$)/,
  /^port_(msg|color|img|thumb|delay|age)(:|$)/, // portaria
  /^pcfg_emoji(:|$)/, // posts
  /^post_comment(:|$)/,
  /^ticket_open:/, // abre modal quando o painel pede motivo
  /^tcfg_(new|a_text|a_color|a_images|m_mode|m_btn|m_ph|o_add|o_edit|o_rmopen|i_text|c_text|i_opttitle|i_images|i_arch|su_text|su_btn|cc_text|lim_text|color|g_limit|x_rename)(:|$)/, // ticket (configuração)
];

const opensModal = (customId) => MODAL_BUTTONS.some((re) => re.test(String(customId)));

const noticePayload = (content) => ({
  components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(content))],
  flags: MessageFlags.IsComponentsV2 | EPHEMERAL,
});

function withFlag(flags, flag) {
  return new MessageFlagsBitField(flags ?? 0).add(flag).bitfield;
}

function ephemeralOf(options) {
  if (!options) return false;
  if (options.ephemeral) return true;
  return options.flags != null && new MessageFlagsBitField(options.flags).has(EPHEMERAL);
}

// Instala, no próprio objeto da interação, versões dos métodos de resposta que se adaptam
// ao estado atual (ainda sem resposta / já confirmada pelo bot).
function instrument(interaction) {
  const native = {
    deferUpdate: interaction.deferUpdate.bind(interaction),
    deferReply: interaction.deferReply.bind(interaction),
    reply: interaction.reply.bind(interaction),
    update: interaction.update.bind(interaction),
    editReply: interaction.editReply.bind(interaction),
    followUp: interaction.followUp.bind(interaction),
    showModal: interaction.showModal?.bind(interaction),
  };

  let state = "none"; // none | update | reply | modal
  let ack = Promise.resolve();
  let auto = false; // a confirmação foi feita pelo wrapper (e não pelo handler)
  let pendingReply = null; // o handler pediu deferReply, mas já confirmamos com deferUpdate
  let replyMessage = null; // mensagem criada no lugar do "deferReply" convertido

  const afterAck = (fn) => ack.then(fn);

  interaction.deferUpdate = (options) => {
    if (state === "none") {
      state = "update";
      return (ack = native.deferUpdate(options));
    }
    return ack.then(() => undefined);
  };

  interaction.deferReply = (options) => {
    if (state === "none") {
      state = "reply";
      return (ack = native.deferReply(options));
    }
    if (auto && state === "update") {
      pendingReply = options ?? {};
      return ack.then(() => undefined);
    }
    return native.deferReply(options);
  };

  interaction.reply = (options) => {
    if (state === "none") {
      state = "reply";
      return (ack = native.reply(options));
    }
    return afterAck(() => native.followUp(options));
  };

  interaction.update = (options) => {
    if (state === "none") {
      state = "update";
      return (ack = native.update(options));
    }
    // Já confirmada: editar a resposta original equivale ao update
    return afterAck(() => native.editReply(options));
  };

  interaction.editReply = (options) =>
    afterAck(async () => {
      if (pendingReply) {
        const eph = ephemeralOf(pendingReply);
        pendingReply = null;
        const payload = typeof options === "string" ? { content: options } : { ...options };
        if (eph) payload.flags = withFlag(payload.flags, EPHEMERAL);
        replyMessage = await native.followUp(payload);
        return replyMessage;
      }
      if (replyMessage) return interaction.webhook.editMessage(replyMessage.id, options);
      return native.editReply(options);
    });

  interaction.followUp = (options) => afterAck(() => native.followUp(options));

  if (native.showModal) {
    interaction.showModal = (modal) => {
      if (state === "none") {
        state = "modal";
        return (ack = native.showModal(modal));
      }
      // O Discord não aceita modal depois que a interação já foi confirmada
      const err = new Error("Modal pedido depois da interação já ter sido confirmada (demorou demais).");
      err.code = "MODAL_TOO_LATE";
      return Promise.reject(err);
    };
  }

  const timer = setTimeout(() => {
    if (state !== "none") return;
    state = "update";
    auto = true;
    console.log(`[BOTAO] Confirmação automática (${AUTO_DEFER_MS}ms): ${interaction.customId}`);
    ack = native.deferUpdate().catch((err) => {
      console.error("[INTERACTION] Não consegui confirmar a interação:", err?.message ?? err);
    });
  }, AUTO_DEFER_MS);

  return () => clearTimeout(timer);
}

// Executa o handler de um botão com confirmação automática e aviso de erro.
async function runProtected(interaction, handler) {
  const stop = instrument(interaction);
  try {
    // Só para testar: defina TESTE_ATRASO_BOTOES=5000 (ms) nas variáveis de ambiente e todo botão protegido
    // passa a demorar esse tempo antes de responder. Remova a variável depois do teste.
    const atraso = Number(process.env.TESTE_ATRASO_BOTOES) || 0;
    if (atraso > 0) await new Promise((resolve) => setTimeout(resolve, atraso));
    return await handler(interaction);
  } catch (err) {
    console.error(`[BOTAO] Erro em ${interaction.customId}:`, err);
    const content =
      err?.code === "MODAL_TOO_LATE"
        ? "Demorei para responder e não consegui abrir a janela. Clique no botão de novo."
        : "Não consegui concluir essa ação. Tente de novo; se continuar, abra o painel novamente.";
    const payload = noticePayload(content);
    // reply() do wrapper vira followUp se a interação já foi confirmada
    await interaction.reply(payload).catch(() => interaction.followUp(payload).catch(() => {}));
  } finally {
    stop();
  }
}

module.exports = { runProtected, opensModal, AUTO_DEFER_MS };
