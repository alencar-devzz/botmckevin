const {
  ContainerBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
  escapeMarkdown,
} = require("discord.js");

// Painel do /convites. Components V2: um container com o título e o avatar da pessoa no canto
// (Thumbnail do Section), um separador e as contagens embaixo.
const num = (n) => Number(n ?? 0).toLocaleString("pt-BR");

function buildInvitesPanel({ stats, name, avatarUrl, tracking }) {
  // Reais = convidados que ainda estão no servidor
  const real = Math.max(0, stats.joined - stats.left);

  const lines = [
    `**Reais** · ${num(real)}`,
    `**Saíram** · ${num(stats.left)}`,
    `**Fakes** (conta recente) · ${num(stats.fake)}`,
  ];
  if (!tracking) lines.push("-# O bot está sem acesso aos convites do servidor, então novas entradas não estão sendo contadas.");

  const header = new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Convites · ${escapeMarkdown(name)}`))
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl));

  return [
    new ContainerBuilder()
      .addSectionComponents(header)
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join("\n"))),
  ];
}

function buildNotice(content) {
  return [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(content))];
}

module.exports = { buildInvitesPanel, buildNotice };
