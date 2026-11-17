const {
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const { PANEL_IMAGE } = require("../utils/ticketConfig");

const HYPESQUAD = [
  { value: "bravery",   label: "HypeSquad Bravery",   desc: "Casa Bravery",   house: 1 },
  { value: "brilliance", label: "HypeSquad Brilliance", desc: "Casa Brilliance", house: 2 },
  { value: "balance",   label: "HypeSquad Balance",   desc: "Casa Balance",   house: 3 },
];

// Painel público enviado pelo n!badges
function buildBadgesPanel() {
  return [
    new ContainerBuilder()
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(PANEL_IMAGE))
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          "**Badges HypeSquad**\n-# Configure sua conta do Discord e defina sua casa HypeSquad."
        )
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("badges:config")
            .setLabel("Configurar conta")
            .setStyle(ButtonStyle.Secondary)
        )
      ),
  ];
}

// Painel de seleção de casa (efêmero, após salvar o token)
function buildBadgesSelectPanel(currentHouse) {
  const houseLabel = currentHouse
    ? (HYPESQUAD.find((h) => h.value === currentHouse)?.label ?? "Desconhecida")
    : "Nenhuma";

  const select = new StringSelectMenuBuilder()
    .setCustomId("badges:house")
    .setPlaceholder("Escolha uma casa HypeSquad")
    .addOptions(
      HYPESQUAD.map((h) =>
        ({ label: h.label, description: h.desc, value: h.value, default: h.value === currentHouse })
      )
    );

  return [
    new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**Selecionar casa HypeSquad**\n-# Casa atual: ${houseLabel}`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addActionRowComponents(new ActionRowBuilder().addComponents(select)),
  ];
}

// Painel de ação (efêmero, após selecionar a casa)
function buildBadgesActionPanel(selected, hasBadge) {
  const house = HYPESQUAD.find((h) => h.value === selected);

  return [
    new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            `**${house.label}**`,
            `-# ${house.desc}`,
            "",
            hasBadge
              ? "Voce ja possui esta badge no perfil."
              : "Voce ainda nao possui esta badge.",
          ].join("\n")
        )
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`badges:add:${selected}`)
            .setLabel("Adicionar")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(hasBadge),
          new ButtonBuilder()
            .setCustomId(`badges:remove:${selected}`)
            .setLabel("Remover")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(!hasBadge)
        )
      ),
  ];
}

module.exports = { buildBadgesPanel, buildBadgesSelectPanel, buildBadgesActionPanel, HYPESQUAD };
