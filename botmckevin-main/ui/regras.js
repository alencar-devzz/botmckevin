const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require("discord.js");
const { PANEL_IMAGE } = require("../utils/ticketConfig");

const SETA = "<:x12_setaenrr:1565522725001240789>";
const NIKE = "<a:b26_nikesymbol:1561080240342827159>";

function botao(customId, label) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(customId)
      .setLabel(label)
      .setStyle(ButtonStyle.Secondary)
  );
}

// Painel enviado pelo comando regras: imagem + 2 botões (cada um com sua descrição)
function buildRegrasPanel() {
  return [
    new ContainerBuilder()
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(PANEL_IMAGE))
      )
      .addActionRowComponents(botao("regras_ver", "regras"))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `-# ${SETA} Clique em **regras** para visualizar todas as **Regras** e **Diretrizes** da comunidade.`
        )
      )
      .addActionRowComponents(botao("regras_termos", "termos"))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `-# ${SETA} Tambem siga os termos da plataforma clicando em **termos.**`
        )
      ),
  ];
}

// Efêmera do botão "regras"
function buildRegrasEfemera() {
  return [
    new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${NIKE} Regras de convivência`)
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            "1. **Respeito a todos**",
            "Xingue à vontade, mas respeite os limites e pare caso alguém se sinta ofendido.",
            "",
            "2. **Sem spam ou propaganda**",
            "Evite mensagens repetidas, correntes, links duvidosos e divulgações sem o consenso da equipe.",
            "",
            "3. **Canais**",
            "Cada assunto tem seu lugar, bate-papo, suporte e comunicados devem seguir a organização do servidor.",
            "",
            "4. **Privacidade**",
            "Não envie dados seus ou de outras pessoas dentro do servidor.",
            "",
            "5. **Respeite as decisões da equipe**",
            "Os moderadores podem aplicar advertências, punições, bloqueios ou banimentos de acordo com a gravidade da infração.",
          ].join("\n")
        )
      ),
  ];
}

// Efêmera do botão "termos"
function buildTermosEfemera() {
  return [
    new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${SETA} https://discord.com/terms`)
    ),
  ];
}

module.exports = { buildRegrasPanel, buildRegrasEfemera, buildTermosEfemera };
