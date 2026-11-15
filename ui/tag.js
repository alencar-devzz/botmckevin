const {
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require("discord.js");
const { PANEL_IMAGE } = require("../utils/ticketConfig");
const { TAG_ROLES } = require("../utils/tagRoles");

// Painel enviado pelo comando tag: imagem do container do ticket + 3 botões (um cargo cada), sem separador
function buildTagPanel() {
  const row = new ActionRowBuilder().addComponents(
    TAG_ROLES.map((tag) =>
      new ButtonBuilder().setCustomId(`tag:${tag.key}`).setEmoji(tag.emoji).setStyle(ButtonStyle.Secondary)
    )
  );

  return [
    new ContainerBuilder()
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(PANEL_IMAGE))
      )
      .addActionRowComponents(row),
  ];
}

module.exports = { buildTagPanel };
