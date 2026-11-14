const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { formatTime } = require("../utils/spotify/card");
const { trackUrl } = require("../utils/spotify/activity");
const { DEFAULT_LABELS } = require("../utils/spotify/store");
const { SOURCE_NAME } = require("../utils/spotify/lyrics");

const text = (content) => new TextDisplayBuilder().setContent(content);

// Card do n!spotify: imagem + botões (link, informações e letra, atualizar).
// Quais botões aparecem e o texto de cada um vêm do painel do n!menu (cfg).
// preview: true deixa os botões desligados (usado na pré-visualização do painel).
function buildSpotifyCard({ fileName, track, userId, cfg = {}, preview = false }) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel(cfg.linkLabel || DEFAULT_LABELS.linkLabel)
      .setURL(trackUrl(track))
      .setDisabled(preview)
  );
  if (cfg.showInfoButton ?? true) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`spt:info:${userId}`)
        .setLabel(cfg.infoLabel || DEFAULT_LABELS.infoLabel)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(preview)
    );
  }
  if (cfg.showRefreshButton ?? true) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`spt:refresh:${userId}`)
        .setLabel(cfg.refreshLabel || DEFAULT_LABELS.refreshLabel)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(preview)
    );
  }

  return [
    new ContainerBuilder()
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${fileName}`))
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addActionRowComponents(row),
  ];
}

// Resposta efêmera: informações da música + primeira parte da letra.
// lyricsPart: texto da letra (ou null); lyricsNote: aviso quando não há letra.
// lyricsSource: "lrclib" | "vagalume" | "off" (quando "off", a seção de letra não aparece).
function buildInfoPanel({ track, userId, lyricsPart, lyricsNote, partLabel, lyricsSource = "lrclib", creditSource }) {
  const container = new ContainerBuilder().addTextDisplayComponents(
    text(
      [
        `### ${track.title}`,
        `Artista(s): ${track.artists}`,
        `Álbum: ${track.album ?? "Não informado"}`,
        `Duração: \`${formatTime(track.durationMs)}\``,
        `Ouvindo: <@${userId}>`,
      ].join("\n")
    )
  );

  if (lyricsSource === "off") return [container];

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(text(lyricsPart ? `### Letra${partLabel}\n${lyricsPart}` : `### Letra\n${lyricsNote}`));
  if (lyricsPart) container.addTextDisplayComponents(text(`-# Letras: ${SOURCE_NAME[creditSource ?? lyricsSource] ?? "LRCLIB"}`));
  return [container];
}

// Continuação da letra (partes seguintes).
function buildLyricsPart(part, label) {
  return [new ContainerBuilder().addTextDisplayComponents(text(`### Letra${label}\n${part}`))];
}

function buildNotice(content) {
  return [new ContainerBuilder().addTextDisplayComponents(text(content))];
}

module.exports = { buildSpotifyCard, buildInfoPanel, buildLyricsPart, buildNotice };
