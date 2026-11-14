const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");

// Card estilo vidro (glass) do n!spotify: capa do álbum de fundo, faixas translúcidas com
// desfoque, título, artistas, barra de progresso e quem está ouvindo.

const W = 1100;
const H = 546;
const GREEN = "#1ed760";

// A fonte vem do pacote dejavu-fonts-ttf (não depende das fontes do servidor da Render).
// Se algo falhar, cai para a fonte padrão do sistema.
let BOLD = "sans-serif";
let REGULAR = "sans-serif";
try {
  GlobalFonts.registerFromPath(require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf"), "SptBold");
  GlobalFonts.registerFromPath(require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans.ttf"), "SptRegular");
  BOLD = "SptBold, sans-serif";
  REGULAR = "SptRegular, sans-serif";
} catch (err) {
  console.error("[SPOTIFY] Fonte DejaVu indisponível, usando a padrão:", err.message);
}

async function loadImageFromUrl(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await loadImage(Buffer.from(await res.arrayBuffer()));
  } catch {
    return null;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// Corta o texto com "…" se passar da largura máxima.
function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function formatTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

// Faixa de vidro: a própria capa desfocada recortada na área + brilho branco leve e borda fina.
function glass(ctx, drawBackdrop, x, y, w, h, radius, tint = 0.1) {
  ctx.save();
  roundRect(ctx, x, y, w, h, radius);
  ctx.clip();
  ctx.filter = "blur(22px)";
  drawBackdrop();
  ctx.filter = "none";
  ctx.fillStyle = `rgba(0, 0, 0, ${0.38})`;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = `rgba(255, 255, 255, ${tint})`;
  ctx.fillRect(x, y, w, h);
  ctx.restore();

  ctx.save();
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, radius);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function spotifyLogo(ctx, cx, cy, r) {
  ctx.fillStyle = GREEN;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#0b0b0b";
  ctx.lineCap = "round";
  const arcs = [
    { w: 0.62, y: -0.3, lw: 0.17 },
    { w: 0.5, y: 0.0, lw: 0.14 },
    { w: 0.38, y: 0.27, lw: 0.12 },
  ];
  for (const a of arcs) {
    const rad = r * a.w * 1.45;
    ctx.lineWidth = r * a.lw;
    ctx.beginPath();
    ctx.arc(cx, cy + r * a.y + rad * 0.55, rad, Math.PI * 1.22, Math.PI * 1.78);
    ctx.stroke();
  }
}

// dados: { title, artists, coverUrl, positionMs, durationMs, userName, avatarUrl }
async function renderSpotifyCard(dados) {
  const { title, artists, coverUrl, positionMs, durationMs, userName, avatarUrl } = dados;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  const [cover, avatar] = await Promise.all([loadImageFromUrl(coverUrl), loadImageFromUrl(avatarUrl)]);

  // Fundo: a capa preenche o card (recorte central); sem capa, um degradê escuro
  const backdrop = () => {
    if (cover) {
      const size = W; // capa quadrada ocupando a largura
      ctx.drawImage(cover, 0, -(size - H) / 2 - 30, size, size);
    } else {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, "#1f3a2a");
      g.addColorStop(1, "#0b0b0b");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  };

  // Cantos arredondados do card inteiro
  roundRect(ctx, 0, 0, W, H, 34);
  ctx.clip();
  backdrop();

  // Escurecimento geral + degradê forte embaixo (legibilidade do texto)
  ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
  ctx.fillRect(0, 0, W, H);
  const shade = ctx.createLinearGradient(0, 200, 0, H);
  shade.addColorStop(0, "rgba(0, 0, 0, 0)");
  shade.addColorStop(0.55, "rgba(0, 0, 0, 0.62)");
  shade.addColorStop(1, "rgba(0, 0, 0, 0.9)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 200, W, H - 200);

  // Pílula "Spotify" de vidro
  glass(ctx, backdrop, 40, 34, 168, 44, 22, 0.1);
  spotifyLogo(ctx, 66, 56, 14);
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 19px ${BOLD}`;
  ctx.textBaseline = "middle";
  ctx.fillText("Spotify", 88, 57);

  // Título (diminui a fonte se for grande) e artistas
  ctx.textBaseline = "alphabetic";
  let titleSize = 56;
  ctx.font = `bold ${titleSize}px ${BOLD}`;
  while (titleSize > 36 && ctx.measureText(title).width > 1000) {
    titleSize -= 2;
    ctx.font = `bold ${titleSize}px ${BOLD}`;
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillText(fitText(ctx, title, 1000), 48, 372);

  ctx.font = `bold 27px ${BOLD}`;
  ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
  ctx.fillText(fitText(ctx, artists, 1000), 48, 408);

  // Barra de progresso
  const barX = 46;
  const barW = W - 92;
  const barY = 436;
  const ratio = durationMs > 0 ? Math.min(1, Math.max(0, positionMs / durationMs)) : 0;
  const filled = barW * ratio;

  ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
  roundRect(ctx, barX, barY, barW, 7, 4);
  ctx.fill();
  ctx.fillStyle = GREEN;
  roundRect(ctx, barX, barY, Math.max(filled, 7), 7, 4);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(barX + filled, barY + 3.5, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = `bold 15px ${BOLD}`;
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.textAlign = "left";
  ctx.fillText(formatTime(positionMs), barX, 472);
  ctx.textAlign = "right";
  ctx.fillText(formatTime(durationMs), barX + barW, 472);
  ctx.textAlign = "left";

  // Rodapé de vidro: "Ouvindo agora" + foto e nome de quem está ouvindo
  glass(ctx, backdrop, 30, 486, W - 60, 46, 23, 0.08);
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 21px ${BOLD}`;
  ctx.textBaseline = "middle";
  ctx.fillText("Ouvindo agora:", 52, 510);
  const labelW = ctx.measureText("Ouvindo agora:").width;

  const ax = 52 + labelW + 20;
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax + 15, 509, 15, 0, Math.PI * 2);
  ctx.clip();
  if (avatar) ctx.drawImage(avatar, ax, 494, 30, 30);
  else {
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.fillRect(ax, 494, 30, 30);
  }
  ctx.restore();

  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.font = `21px ${REGULAR}`;
  ctx.fillText(fitText(ctx, userName, 480), ax + 42, 510);

  return canvas.toBuffer("image/png");
}

module.exports = { renderSpotifyCard, formatTime };
