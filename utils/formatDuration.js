function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);

  if (seconds < 60) return `${seconds} segundo${seconds === 1 ? "" : "s"}`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minuto${minutes === 1 ? "" : "s"}`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hora${hours === 1 ? "" : "s"}`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} dia${days === 1 ? "" : "s"}`;

  const weeks = Math.floor(days / 7);
  return `${weeks} semana${weeks === 1 ? "" : "s"}`;
}

module.exports = { formatDuration };
