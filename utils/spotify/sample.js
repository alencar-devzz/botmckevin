const { createCanvas } = require("@napi-rs/canvas");

// Capa de exemplo (desenhada na hora, sem baixar nada) para a pré-visualização do painel
// quando quem configura não está ouvindo nada no Spotify.
let cached = null;

function sampleCoverUrl() {
  if (cached) return cached;
  const size = 640;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, "#7a1fa2");
  g.addColorStop(0.55, "#d6336c");
  g.addColorStop(1, "#ff9a3c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = "rgba(255, 214, 102, 0.9)";
  ctx.beginPath();
  ctx.arc(size / 2, size / 2 - 30, 150, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(20, 0, 40, 0.35)";
  ctx.beginPath();
  ctx.arc(size / 2 + 90, size / 2 + 130, 120, 0, Math.PI * 2);
  ctx.fill();

  cached = `data:image/png;base64,${canvas.toBuffer("image/png").toString("base64")}`;
  return cached;
}

module.exports = { sampleCoverUrl };
