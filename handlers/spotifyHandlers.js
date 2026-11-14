const { AttachmentBuilder, MessageFlags } = require("discord.js");
const { getSpotify, getPosition } = require("../utils/spotify/activity");
const { renderSpotifyCard } = require("../utils/spotify/card");
const { fetchLyrics, splitLyrics } = require("../utils/spotify/lyrics");
const { buildSpotifyCard, buildInfoPanel, buildLyricsPart, buildNotice } = require("../ui/spotify");

const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL_V2 = MessageFlags.Ephemeral | MessageFlags.IsComponentsV2;
const MAX_PARTS = 6;
const NO_MENTIONS = { parse: [] };

// Guarda a música de cada card enviado (para a letra bater com o que está no card mesmo que a
// pessoa já tenha trocado de música). Se o bot reiniciar, usa a música atual da pessoa.
const cards = new Map();
function rememberCard(messageId, track) {
  cards.set(messageId, track);
  if (cards.size > 300) cards.delete(cards.keys().next().value);
}

// Monta o card (imagem + botões) de uma música. Usado pelo comando e pelo botão Atualizar.
async function buildCardPayload({ track, member, userId }) {
  const buffer = await renderSpotifyCard({
    title: track.title,
    artists: track.artists,
    coverUrl: track.coverUrl,
    positionMs: getPosition(track),
    durationMs: track.durationMs,
    userName: member?.displayName ?? "alguém",
    avatarUrl: member?.displayAvatarURL({ extension: "png", size: 128 }) ?? null,
  });
  const fileName = `spotify-${Date.now()}.png`;
  return {
    components: buildSpotifyCard({ fileName, track, userId }),
    files: [new AttachmentBuilder(buffer, { name: fileName })],
    flags: V2,
    allowedMentions: NO_MENTIONS,
  };
}

async function handleSpotifyButton(interaction) {
  const [, action, userId] = interaction.customId.split(":");

  // Botão Atualizar: lê de novo o Spotify da pessoa e refaz o card com o ponto atual da música
  if (action === "refresh") {
    const track = getSpotify(interaction.guild, userId);
    if (!track) {
      return interaction.reply({
        components: buildNotice("Essa pessoa não está ouvindo nada no Spotify agora."),
        flags: EPHEMERAL_V2,
      });
    }

    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    const payload = await buildCardPayload({ track, member, userId });
    rememberCard(interaction.message.id, track);
    return interaction.update({ ...payload, attachments: [] });
  }

  // Botão Informações e letra: resposta efêmera com os dados e a letra completa
  if (action === "info") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const track = cards.get(interaction.message.id) ?? getSpotify(interaction.guild, userId);
    if (!track) {
      return interaction.editReply({
        components: buildNotice("Não tenho mais os dados desse card. Use o botão Atualizar ou envie o comando de novo."),
        flags: V2,
      });
    }

    const lyrics = await fetchLyrics(track);
    const parts = lyrics?.text ? splitLyrics(lyrics.text).slice(0, MAX_PARTS) : [];
    const label = (i) => (parts.length > 1 ? ` (${i + 1}/${parts.length})` : "");

    await interaction.editReply({
      components: buildInfoPanel({
        track,
        userId,
        lyricsPart: parts[0] ?? null,
        partLabel: label(0),
        lyricsNote: lyrics?.instrumental
          ? "Essa música é instrumental."
          : "Não encontrei a letra dessa música.",
      }),
      flags: V2,
      allowedMentions: NO_MENTIONS,
    });

    for (let i = 1; i < parts.length; i++) {
      await interaction.followUp({ components: buildLyricsPart(parts[i], label(i)), flags: EPHEMERAL_V2 });
    }
  }
}

module.exports = { handleSpotifyButton, buildCardPayload, rememberCard };
