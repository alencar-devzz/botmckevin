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
const { DEFAULT_LABELS, DEFAULT_INFO_LABELS, buttonEmoji } = require("../utils/spotify/store");
const { SOURCE_NAME } = require("../utils/spotify/lyrics");

const text = (content) => new TextDisplayBuilder().setContent(content);

const STYLE = {
  secondary: ButtonStyle.Secondary,
  primary: ButtonStyle.Primary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
};

// Cor lateral do container (#rrggbb do painel) -> número; sem cor, não pinta
function applyAccent(container, hex) {
  if (/^#[0-9a-f]{6}$/i.test(hex ?? "")) container.setAccentColor(parseInt(hex.slice(1), 16));
  return container;
}

function withEmoji(button, value) {
  const emoji = buttonEmoji(value);
  if (emoji) button.setEmoji(emoji);
  return button;
}

// Card do n!spotify: imagem + botões (link, informações e letra, atualizar).
// Quais botões aparecem, texto, emoji e cor de cada um vêm do painel do n!menu (cfg).
// preview: true deixa os botões desligados (usado na pré-visualização do painel).
function buildSpotifyCard({ fileName, track, userId, cfg = {}, preview = false }) {
  const row = new ActionRowBuilder().addComponents(
    withEmoji(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel(cfg.linkLabel || DEFAULT_LABELS.linkLabel)
        .setURL(trackUrl(track))
        .setDisabled(preview),
      cfg.linkEmoji
    )
  );
  if (cfg.showInfoButton ?? true) {
    row.addComponents(
      withEmoji(
        new ButtonBuilder()
          .setCustomId(`spt:info:${userId}`)
          .setLabel(cfg.infoLabel || DEFAULT_LABELS.infoLabel)
          .setStyle(STYLE[cfg.infoStyle] ?? ButtonStyle.Secondary)
          .setDisabled(preview),
        cfg.infoEmoji
      )
    );
  }
  if (cfg.showRefreshButton ?? true) {
    row.addComponents(
      withEmoji(
        new ButtonBuilder()
          .setCustomId(`spt:refresh:${userId}`)
          .setLabel(cfg.refreshLabel || DEFAULT_LABELS.refreshLabel)
          .setStyle(STYLE[cfg.refreshStyle] ?? ButtonStyle.Secondary)
          .setDisabled(preview),
        cfg.refreshEmoji
      )
    );
  }

  return [
    applyAccent(
      new ContainerBuilder()
        .addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${fileName}`))
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addActionRowComponents(row),
      cfg.containerHex
    ),
  ];
}

// Resposta efêmera: informações da música + primeira parte da letra.
// lyricsPart: texto da letra (ou null); lyricsNote: aviso quando não há letra.
// lyricsSource: "lrclib" | "vagalume" | "off" (quando "off", a seção de letra não aparece).
// cfg: textos e cor do painel do n!menu.
function buildInfoPanel({ track, userId, lyricsPart, lyricsNote, partLabel, lyricsSource = "lrclib", creditSource, cfg = {} }) {
  const t = { ...DEFAULT_INFO_LABELS, ...Object.fromEntries(Object.entries(cfg).filter(([k]) => k in DEFAULT_INFO_LABELS)) };
  const container = applyAccent(
    new ContainerBuilder().addTextDisplayComponents(
      text(
        [
          `### ${track.title}`,
          `${t.infoArtistLabel}: ${track.artists}`,
          `${t.infoAlbumLabel}: ${track.album ?? "Não informado"}`,
          `${t.infoDurationLabel}: \`${formatTime(track.durationMs)}\``,
          `${t.infoListeningLabel}: <@${userId}>`,
        ].join("\n")
      )
    ),
    cfg.containerHex
  );

  if (lyricsSource === "off") return [container];

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(
    text(lyricsPart ? `### ${t.lyricsTitle}${partLabel}\n${lyricsPart}` : `### ${t.lyricsTitle}\n${lyricsNote}`)
  );
  if (lyricsPart) container.addTextDisplayComponents(text(`-# Letras: ${SOURCE_NAME[creditSource ?? lyricsSource] ?? "LRCLIB"}`));
  return [container];
}

// Continuação da letra (partes seguintes).
function buildLyricsPart(part, label, cfg = {}) {
  const title = cfg.lyricsTitle || DEFAULT_INFO_LABELS.lyricsTitle;
  return [applyAccent(new ContainerBuilder().addTextDisplayComponents(text(`### ${title}${label}\n${part}`)), cfg.containerHex)];
}

function buildNotice(content) {
  return [new ContainerBuilder().addTextDisplayComponents(text(content))];
}

module.exports = { buildSpotifyCard, buildInfoPanel, buildLyricsPart, buildNotice };
