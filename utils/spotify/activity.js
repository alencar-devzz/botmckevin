const { ActivityType } = require("discord.js");

// Lê o Rich Presence do Spotify de uma pessoa (precisa da intent GuildPresences).
// Retorna null se ela não estiver ouvindo nada no Spotify.
function getSpotify(guild, userId) {
  const presence = guild.presences.cache.get(userId);
  const act = presence?.activities?.find(
    (a) => a.type === ActivityType.Listening && a.name === "Spotify" && a.syncId
  );
  if (!act) return null;

  const start = act.timestamps?.start?.getTime() ?? null;
  const end = act.timestamps?.end?.getTime() ?? null;

  return {
    trackId: act.syncId,
    title: act.details || "Sem título",
    artists: act.state || "Artista desconhecido", // vários artistas vêm separados por "; "
    album: act.assets?.largeText || null,
    coverUrl: act.assets?.largeImageURL?.({ size: 640 }) ?? null,
    startMs: start,
    durationMs: start && end ? end - start : 0,
  };
}

// Em qual ponto da música a pessoa está agora (em ms).
function getPosition(track) {
  if (!track.startMs || !track.durationMs) return 0;
  return Math.min(track.durationMs, Math.max(0, Date.now() - track.startMs));
}

const trackUrl = (track) => `https://open.spotify.com/track/${track.trackId}`;

module.exports = { getSpotify, getPosition, trackUrl };
