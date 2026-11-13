const {
  ContainerBuilder,
  TextDisplayBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require("discord.js");
const { PANEL_IMAGE } = require("../utils/ticketConfig");

const PONTO = "<:b29_periodwhite:1565528017441132687>";

// Painel enviado pelo comando booster: imagem + 1 botão
function buildBoosterPanel() {
  return [
    new ContainerBuilder()
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(PANEL_IMAGE))
      )
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("booster_ver")
            .setLabel("booster")
            .setStyle(ButtonStyle.Secondary)
        )
      ),
  ];
}

// Efêmera do botão
function buildBoosterEfemera() {
  const beneficios = [
    "Cargo cl",
    "Cargo png",
    "Cargo pd",
    "Perm para links",
    "Perm tela em call",
    "Call privada",
    "Cargo personalizado",
  ];

  return [
    new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "## Seja booster",
          "-# **Benefícios:**",
          ...beneficios.map((b) => `${PONTO} ${b}`),
        ].join("\n")
      )
    ),
  ];
}

module.exports = { buildBoosterPanel, buildBoosterEfemera };
