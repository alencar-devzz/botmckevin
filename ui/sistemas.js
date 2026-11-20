const {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { buildSearchButton, SISTEMAS } = require("./mainMenu");

// Painel da categoria "Sistemas" do /menu.
// Lista os três sistemas principais (Aparência, Comunidade, Moderação)
// no mesmo estilo das demais categorias (categoryPanel.js).

const EMOJI = {
  home: { name: "home", id: "1573393029203624197" },
  open: { name: "settings", id: "1570940544614539264" },
};

const text = (content) => new TextDisplayBuilder().setContent(String(content).slice(0, 3500));

function buildSistemasPanel() {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text("## Sistemas"),
      text("-# Configurações gerais do bot: aparência, comunidade e moderação.")
    )
    .addSeparatorComponents(new SeparatorBuilder());

  for (const option of SISTEMAS) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(text(`**${option.label}**\n-# ${option.description}`))
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(`cat:sistemas:open:${option.value}`)
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

module.exports = { buildSistemasPanel };
