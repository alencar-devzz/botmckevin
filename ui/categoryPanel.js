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

// Telas das categorias do /menu (Comunidade, Moderação): lista paginada de sistemas.
// Cada sistema tem um botão de engrenagem que abre a configuração dele.
// Embaixo do container: início, anterior, página, próxima e Buscar.
const PAGE_SIZE = 4;

const EMOJI = {
  home: { name: "home", id: "1573393029203624197" },
  prev: { name: "left2", id: "1573414733745365064" },
  next: { name: "right2", id: "1573414717114810448" },
  open: { name: "settings", id: "1570940544614539264" },
};

const text = (content) => new TextDisplayBuilder().setContent(String(content).slice(0, 3500));

const pageCount = (options) => Math.max(1, Math.ceil(options.length / PAGE_SIZE));
const clampPage = (page, options) => Math.min(Math.max(Number(page) || 0, 0), pageCount(options) - 1);

// group = "comunidade" | "moderacao" (vai nos ids dos botões: cat:<group>:<ação>:<valor>)
function buildCategoryPanel({ group, title, description, options, page = 0 }) {
  const current = clampPage(page, options);
  const pages = pageCount(options);
  const slice = options.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(title), text(`-# ${description}`))
    .addSeparatorComponents(new SeparatorBuilder());

  if (!slice.length) {
    container.addTextDisplayComponents(text("-# Nenhum sistema nesta categoria ainda."));
  }

  for (const option of slice) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(text(`**${option.label}**\n-# ${option.description}`))
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(`cat:${group}:open:${option.value}`)
            .setEmoji(EMOJI.open)
            .setStyle(ButtonStyle.Secondary)
        )
    );
  }

  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("back_main").setEmoji(EMOJI.home).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`cat:${group}:prev:${current - 1}`)
      .setEmoji(EMOJI.prev)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(current <= 0),
    new ButtonBuilder()
      .setCustomId(`cat:${group}:idx`)
      .setLabel(`${current + 1}/${pages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`cat:${group}:next:${current + 1}`)
      .setEmoji(EMOJI.next)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(current >= pages - 1),
    buildSearchButton()
  );

  return [container, nav];
}

module.exports = { buildCategoryPanel, PAGE_SIZE, pageCount };
