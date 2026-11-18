const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require("discord.js");

// customIds do sistema de call. Ficam num lugar só para a UI e os handlers nunca divergirem.
const IDS = {
  selectInitial: "botcall_select_initial", // select do painel (quando ainda não há call selecionada)
  choose: "botcall_choose", // botão Selecionar (abre a efêmera com o select)
  connect: "botcall_connect", // botão Conectar
  disconnect: "botcall_disconnect", // botão Desconectar
  pick: "botcall_pick", // select da efêmera: botcall_pick:<id da mensagem do painel>
};

function buildCallSelect(customId) {
  return new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder("Selecione a call")
      .addChannelTypes(ChannelType.GuildVoice)
      .setMinValues(1)
      .setMaxValues(1)
  );
}

// Texto do status e a dica que aparece embaixo dele, de acordo com a situação real do bot
function describeView(view) {
  const since = view.since ? Math.floor(view.since / 1000) : null;

  switch (view.status) {
    case "connected":
      return {
        status: since ? `Conectado desde <t:${since}:R>` : "Conectado",
        hint:
          "O bot fica na call e volta sozinho se a conexão cair ou se ele reiniciar. " +
          "Se um membro desconectar o bot manualmente, ele não volta.",
      };

    case "connecting":
      return { status: "Conectando", hint: "O bot está entrando na call." };

    case "reconnecting":
      return {
        status: "Reconectando",
        hint: "A conexão com a call foi perdida. O bot está tentando voltar sozinho.",
      };

    default: {
      const hints = {
        button: "O bot foi desconectado pelo painel e só volta quando você clicar em Conectar.",
        member: "Um membro desconectou o bot. Ele não volta sozinho: clique em Conectar para chamá-lo de volta.",
        channel_deleted: "A call anterior foi apagada. Selecione outra call para o bot entrar.",
      };
      return {
        status: "Desconectado",
        hint:
          hints[view.reason] ??
          (view.channelId
            ? "Clique em Conectar para o bot entrar na call."
            : "Selecione uma call abaixo para o bot entrar."),
      };
    }
  }
}

// Painel principal.
// - Sem call selecionada: mostra o select menu para escolher a call.
// - Com call selecionada: mostra os botões [Selecionar] e [Desconectar] (ou [Conectar] se estiver desconectado).
// "view" vem de getCallView() (utils/callKeeper.js): { channelId, status, reason, since }.
function buildBotcallPanel(view = {}) {
  const safe = { channelId: null, status: "disconnected", reason: null, since: null, ...view };
  const { status, hint } = describeView(safe);

  const text = [
    "## Call do bot",
    "-# Sistema de **Call** do bot",
    "",
    `**Call selecionada:** ${safe.channelId ? `<#${safe.channelId}>` : "Não selecionada"}`,
    `**Status:** ${status}`,
    `-# ${hint}`,
  ].join("\n");

  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
    .addSeparatorComponents(new SeparatorBuilder());

  if (!safe.channelId) {
    container.addActionRowComponents(buildCallSelect(IDS.selectInitial));
    return [container];
  }

  const choose = new ButtonBuilder().setCustomId(IDS.choose).setLabel("Selecionar").setStyle(ButtonStyle.Secondary);

  const link =
    safe.status === "disconnected"
      ? new ButtonBuilder().setCustomId(IDS.connect).setLabel("Conectar").setStyle(ButtonStyle.Success)
      : new ButtonBuilder().setCustomId(IDS.disconnect).setLabel("Desconectar").setStyle(ButtonStyle.Danger);

  container.addActionRowComponents(new ActionRowBuilder().addComponents(choose, link));
  return [container];
}

// Efêmera do botão "Selecionar": só um container com o select menu.
// O id da mensagem do painel vai no customId para o painel poder ser atualizado depois.
function buildBotcallPicker(panelMessageId) {
  return [new ContainerBuilder().addActionRowComponents(buildCallSelect(`${IDS.pick}:${panelMessageId}`))];
}

// Troca o select da efêmera por uma confirmação depois que o bot entra na call
function buildBotcallConfirm(channelId) {
  return [
    new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# O bot entrou em <#${channelId}> e vai ficar nela.`)
    ),
  ];
}

// Aviso curto em efêmera (erros e permissões)
function buildBotcallNotice(text) {
  return [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(text))];
}

module.exports = {
  IDS,
  buildBotcallPanel,
  buildBotcallPicker,
  buildBotcallConfirm,
  buildBotcallNotice,
};
