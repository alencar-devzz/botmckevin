const { AttachmentBuilder, MessageFlags } = require("discord.js");
const { getSpotify, getPosition } = require("../utils/spotify/activity");
const { renderSpotifyCard, prefetchCardImages } = require("../utils/spotify/card");
const { fetchLyrics, splitLyrics } = require("../utils/spotify/lyrics");
const { buildSpotifyCard, buildInfoPanel, buildNotice } = require("../ui/spotify");
const { getSpotifyConfig } = require("../utils/spotify/store");

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

// Letras divididas em páginas, por mensagem efêmera do painel de informações (para os botões de página).
// Se o bot reiniciar, o botão pede para abrir "Informações e letra" de novo.
const lyricsPages = new Map();
function rememberLyrics(messageId, data) {
  lyricsPages.set(messageId, data);
  if (lyricsPages.size > 200) lyricsPages.delete(lyricsPages.keys().next().value);
}

// Dados que o desenho do card usa (o mesmo para o download antecipado e para o desenho)
function cardData(track, member) {
  return {
    title: track.title,
    artists: track.artists,
    coverUrl: track.coverUrl,
    positionMs: getPosition(track),
    durationMs: track.durationMs,
    userName: member?.user?.username ?? "alguém", // nameTag (sem caracteres que a fonte não desenha)
    displayName: member?.displayName ?? member?.user?.username ?? "alguém",
    avatarUrl: member?.displayAvatarURL({ extension: "png", size: 128 }) ?? null,
  };
}

// Começa a baixar as imagens do card em segundo plano (não espera). Chamado assim que a música é conhecida,
// enquanto o comando ainda confere permissão, espera e configuração.
function prefetchCard(track, member, cfg) {
  prefetchCardImages(cardData(track, member), cfg);
}

// Monta o card (imagem + botões) de uma música. Usado pelo comando, pelo botão Atualizar e pela
// pré-visualização do painel. cfg = configuração do n!menu (se não vier, é carregada do servidor).
async function buildCardPayload({ track, member, userId, cfg, preview = false }) {
  cfg ??= await getSpotifyConfig(member.guild.id);
  const buffer = await renderSpotifyCard(
    cardData(track, member),
    cfg // cores, formato, textos e ícones do painel (a renderização lê só o que precisa)
  );
  const fileName = `spotify-${Date.now()}.png`;
  return {
    components: buildSpotifyCard({ fileName, track, userId, cfg, preview }),
    files: [new AttachmentBuilder(buffer, { name: fileName })],
    flags: V2,
    allowedMentions: NO_MENTIONS,
  };
}

async function handleSpotifyButton(interaction) {
  const [, action, userId] = interaction.customId.split(":"); // em "lyr", o terceiro valor é o número da página

  // Botão Atualizar: lê de novo o Spotify da pessoa e refaz o card com o ponto atual da música.
  // Confirma o clique ANTES de desenhar a imagem (ganha 15 minutos para responder, não falha por demora).
  if (action === "refresh") {
    await interaction.deferUpdate();

    const track = getSpotify(interaction.guild, userId);
    if (!track) {
      return interaction.followUp({
        components: buildNotice("Essa pessoa não está ouvindo nada no Spotify agora."),
        flags: EPHEMERAL_V2,
      });
    }

    const [member, cfg] = await Promise.all([
      interaction.guild.members.cache.get(userId) ?? interaction.guild.members.fetch(userId).catch(() => null),
      getSpotifyConfig(interaction.guild.id),
    ]);
    if (member) prefetchCard(track, member, cfg);
    const { components, files } = await buildCardPayload({ track, member, userId, cfg });
    rememberCard(interaction.message.id, track);
    // Edita a própria mensagem (a imagem antiga é trocada pela nova)
    return interaction.message.edit({ components, files, attachments: [] });
  }

  // Botões Página anterior / Próxima página da letra: troca a página na própria mensagem
  if (action === "lyr") {
    const data = lyricsPages.get(interaction.message.id);
    if (!data) {
      return interaction.reply({
        components: buildNotice("Essa letra expirou. Use o botão Informações e letra de novo."),
        flags: EPHEMERAL_V2,
      });
    }
    const page = Math.min(Math.max(Number(userId) || 0, 0), data.parts.length - 1);
    const cfg = await getSpotifyConfig(interaction.guild.id);
    return interaction.update({
      components: buildInfoPanel({
        track: data.track,
        userId: data.userId,
        lyricsPart: data.parts[page],
        partLabel: ` (${page + 1}/${data.parts.length})`,
        page,
        pages: data.parts.length,
        lyricsSource: cfg.lyricsSource,
        creditSource: data.creditSource,
        cfg,
      }),
      allowedMentions: NO_MENTIONS,
    });
  }

  // Botão Informações e letra: resposta efêmera com os dados e a primeira página da letra
  if (action === "info") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const track = cards.get(interaction.message.id) ?? getSpotify(interaction.guild, userId);
    if (!track) {
      return interaction.editReply({
        components: buildNotice("Não tenho mais os dados desse card. Use o botão Atualizar ou envie o comando de novo."),
        flags: V2,
      });
    }

    const cfg = await getSpotifyConfig(interaction.guild.id);
    const lyrics = await fetchLyrics(track, cfg.lyricsSource);
    const parts = lyrics?.text ? splitLyrics(lyrics.text).slice(0, MAX_PARTS) : [];
    const label = (i) => (parts.length > 1 ? ` (${i + 1}/${parts.length})` : "");

    const reply = await interaction.editReply({
      components: buildInfoPanel({
        track,
        userId,
        lyricsPart: parts[0] ?? null,
        partLabel: label(0),
        page: 0,
        pages: parts.length,
        lyricsSource: cfg.lyricsSource,
        creditSource: lyrics?.source,
        cfg,
        lyricsNote: lyrics?.instrumental
          ? "Essa música é instrumental."
          : "Não encontrei a letra dessa música.",
      }),
      flags: V2,
      allowedMentions: NO_MENTIONS,
    });

    // Letra grande: guarda as páginas para os botões trocarem de página na mesma mensagem
    if (parts.length > 1) rememberLyrics(reply.id, { parts, track, userId, creditSource: lyrics?.source });
  }
}

module.exports = { handleSpotifyButton, buildCardPayload, rememberCard, prefetchCard };
