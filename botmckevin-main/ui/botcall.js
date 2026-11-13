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

// Painel principal.
// - Sem call selecionada: mostra o select menu.
// - Com call selecionada: mostra os botões [Selecionar] e [Desconectar/Conectar].
// O id da call vai dentro do customId dos botões, então o painel continua
// funcionando mesmo depois de reiniciar o bot.
function buildBotcallPanel({ selectedId = null, connected = false } = {}) {
  const text = [
    "## Call do bot",
    "-# Sistema de **Call** do bot",
    `-# Call selecionada: ${selectedId ? `<#${selectedId}>` : "Não selecionada"} · Status: ${
      connected ? "Conectado" : "Desconectado"
    }`,
  ].join("\n");

  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
    .addSeparatorComponents(new SeparatorBuilder());

  if (!selectedId) {
    container.addActionRowComponents(buildCallSelect("botcall_select_initial"));
    return [container];
  }

  const botaoSelecionar = new ButtonBuilder()
    .setCustomId("botcall_choose")
    .setLabel("Selecionar")
    .setStyle(ButtonStyle.Secondary);

  const botaoConexao = connected
    ? new ButtonBuilder()
        .setCustomId(`botcall_disconnect:${selectedId}`)
        .setLabel("Desconectar")
        .setStyle(ButtonStyle.Danger)
    : new ButtonBuilder()
        .setCustomId(`botcall_connect:${selectedId}`)
        .setLabel("Conectar")
        .setStyle(ButtonStyle.Success);

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(botaoSelecionar, botaoConexao)
  );
  return [container];
}

// Efêmera do botão "Selecionar": só um container com o select menu.
// O id da mensagem do painel vai no customId para podermos atualizá-lo depois.
function buildBotcallSelectEfemera(panelMessageId) {
  return [
    new ContainerBuilder().addActionRowComponents(
      buildCallSelect(`botcall_pick:${panelMessageId}`)
    ),
  ];
}

// Troca o select da efêmera por uma confirmação depois que o bot entra na call.
function buildBotcallConfirmEfemera(channelId) {
  return [
    new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# Bot conectado em <#${channelId}>.`)
    ),
  ];
}

module.exports = {
  buildBotcallPanel,
  buildBotcallSelectEfemera,
  buildBotcallConfirmEfemera,
};
