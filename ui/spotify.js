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

const text = (content) => new TextDisplayBuilder().setContent(content);

// Card do n!spotify: imagem + 3 botões (link, informações e letra, atualizar).
function buildSpotifyCard({ fileName, track, userId }) {
  return [
    new ContainerBuilder()
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${fileName}`))
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Abrir no Spotify").setURL(trackUrl(track)),
          new ButtonBuilder()
            .setCustomId(`spt:info:${userId}`)
            .setLabel("Informações e letra")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`spt:refresh:${userId}`).setLabel("Atualizar").setStyle(ButtonStyle.Secondary)
        )
      ),
  ];
}

// Resposta efêmera: informações da música + primeira parte da letra.
// lyricsPart: texto da letra (ou null); lyricsNote: aviso quando não há letra.
function buildInfoPanel({ track, userId, lyricsPart, lyricsNote, partLabel }) {
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

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(text(lyricsPart ? `### Letra${partLabel}\n${lyricsPart}` : `### Letra\n${lyricsNote}`));
  if (lyricsPart) container.addTextDisplayComponents(text("-# Letras: LRCLIB"));
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
