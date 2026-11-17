const {
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const { PANEL_IMAGE } = require("../utils/ticketConfig");

const HYPESQUAD = [
  { value: "bravery",    label: "HypeSquad Bravery",    desc: "Casa da coragem e determinação",   house: 1 },
  { value: "brilliance", label: "HypeSquad Brilliance",  desc: "Casa da criatividade e energia",   house: 2 },
  { value: "balance",    label: "HypeSquad Balance",     desc: "Casa da calma e diplomacia",       house: 3 },
];

const HOUSE_LABEL = { bravery: "HypeSquad Bravery", brilliance: "HypeSquad Brilliance", balance: "HypeSquad Balance" };

// ─── painel público (n!badges) ────────────────────────────────────────────────
function buildBadgesPanel() {
  const select = new StringSelectMenuBuilder()
    .setCustomId("badges:menu")
    .setPlaceholder("Selecione uma opção")
    .addOptions({ label: "Configurar conta", description: "Vincule o token da sua conta", value: "config" });

  return [
    new ContainerBuilder()
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(PANEL_IMAGE))
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          "**Badges HypeSquad**\n-# Escolha sua casa e adicione ou remova a badge do seu perfil do Discord."
        )
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addActionRowComponents(new ActionRowBuilder().addComponents(select)),
  ];
}

// ─── painel de seleção de casa (efêmero) ──────────────────────────────────────
function buildBadgesSelectPanel(currentHouse) {
  const houseLabel = currentHouse ? (HOUSE_LABEL[currentHouse] ?? "Desconhecida") : "Nenhuma";

  const select = new StringSelectMenuBuilder()
    .setCustomId("badges:house")
    .setPlaceholder("Escolha uma casa HypeSquad")
    .addOptions(
      HYPESQUAD.map((h) => ({
        label: h.label,
        description: h.desc,
        value: h.value,
        default: h.value === currentHouse,
      }))
    );

  return [
    new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            "**Selecionar casa HypeSquad**",
            `> Casa atual no seu perfil: **${houseLabel}**`,
            "-# Selecione abaixo a casa que deseja gerenciar.",
          ].join("\n")
        )
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addActionRowComponents(new ActionRowBuilder().addComponents(select)),
  ];
}

// ─── painel de ação (efêmero) ─────────────────────────────────────────────────
function buildBadgesActionPanel(selected, currentHouse) {
  const house   = HYPESQUAD.find((h) => h.value === selected);
  const hasBadge = currentHouse === selected;

  const statusLine = hasBadge
    ? "> Voce ja possui esta badge no seu perfil."
    : "> Voce ainda nao possui esta badge no seu perfil.";

  return [
    new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            `**${house.label}**`,
            `-# ${house.desc}`,
            "",
            statusLine,
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
            .setDisabled(!hasBadge),
          new ButtonBuilder()
            .setCustomId("badges:back")
            .setLabel("Voltar")
            .setStyle(ButtonStyle.Secondary)
        )
      ),
  ];
}

module.exports = { buildBadgesPanel, buildBadgesSelectPanel, buildBadgesActionPanel, HYPESQUAD };
