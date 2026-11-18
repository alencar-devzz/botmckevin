const {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { buildSearchButton } = require("./mainMenu");

// Painel da categoria "Outros" do /menu.
// Usa o mesmo estilo das categorias Comunidade e Moderação (categoryPanel.js),
// mas com grupo fixo "outros" e lista própria de sistemas.

const EMOJI = {
  home: { name: "home", id: "1570991310612201482" },
  open: { name: "settings", id: "1570940544614539264" },
};

const text = (content) => new TextDisplayBuilder().setContent(String(content).slice(0, 3500));

// Opções visíveis no painel Outros
const OUTROS_OPCOES = [
  {
    label: "Criador de mensagens",
    description: "Monte, revise e publique mensagens personalizadas.",
    value: "msg",
  },
  {
    label: "Sorteios",
    description: "Crie, publique e acompanhe sorteios do servidor.",
    value: "sorteios",
  },
];

function buildOutrosPanel() {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text("## Outros"),
      text("-# Ferramentas e utilitários adicionais do bot.")
    )
    .addSeparatorComponents(new SeparatorBuilder());

  for (const option of OUTROS_OPCOES) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(text(`**${option.label}**\n-# ${option.description}`))
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(`cat:outros:open:${option.value}`)
            .setEmoji(EMOJI.open)
            .setStyle(ButtonStyle.Secondary)
        )
    );
  }

  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("back_main").setEmoji(EMOJI.home).setStyle(ButtonStyle.Secondary),
    buildSearchButton()
  );

  return [container, nav];
}

module.exports = { buildOutrosPanel, OUTROS_OPCOES };
