const { ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder } = require("discord.js");

// Painel do /convites. Components V2: um container com o texto à esquerda e o avatar da pessoa
// no canto (Thumbnail do Section).
const BRAND = "NameTage";

const num = (n) => Number(n ?? 0).toLocaleString("pt-BR");

function buildInvitesPanel({ stats, avatarUrl, tracking }) {
  const lines = [
    `## Convites · ${BRAND}`,
    `**Convites** · ${num(stats.links)}`,
    `**Entraram** · ${num(stats.joined)}`,
    `**Saíram** · ${num(stats.left)}`,
    `**Fakes** (conta recente) · ${num(stats.fake)}`,
  ];
  if (!tracking) lines.push("-# O bot está sem acesso aos convites do servidor, então novas entradas não estão sendo contadas.");

  const section = new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join("\n")))
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl));

  return [new ContainerBuilder().addSectionComponents(section)];
}

function buildNotice(content) {
  return [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(content))];
}

module.exports = { buildInvitesPanel, buildNotice };
