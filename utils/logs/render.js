const {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  ThumbnailBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { formatDateTime } = require("./format");

const text = (content) => new TextDisplayBuilder().setContent(String(content).slice(0, 1500));

// spec = { title, color, thumbnail, groups, openUrl }
// groups: lista de blocos; cada bloco é uma lista de linhas. O primeiro vai junto do título e da miniatura.
function buildLogComponents(spec) {
  const container = new ContainerBuilder().setAccentColor(spec.color);
  const [first = [], ...rest] = spec.groups;

  const head = [text(`## ${spec.title}`)];
  if (first.length) head.push(text(first.join("\n")));

  if (spec.thumbnail) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(...head)
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(spec.thumbnail))
    );
  } else {
    container.addTextDisplayComponents(...head);
  }

  rest.forEach((group, index) => {
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(text(group.join("\n")));
    // Botão de atalho logo depois do segundo bloco (ex: "Abrir mensagem")
    if (spec.openUrl && index === 0) {
      container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel("Abrir mensagem")
            .setURL(spec.openUrl)
        )
      );
    }
  });

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(text(formatDateTime()));

  return [container];
}

module.exports = { buildLogComponents };
