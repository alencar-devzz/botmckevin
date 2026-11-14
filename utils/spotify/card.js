const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");

// Card estilo vidro (glass) do n!spotify: capa do álbum de fundo, faixas translúcidas com
// desfoque, título, artistas, barra de progresso e quem está ouvindo.

const W = 1100;
const H = 546;
const MARGIN = 70; // sobra em volta da cópia desfocada (evita borda transparente do desfoque)
const GREEN = "#1ed760";

// Intensidade do vidro: dim = escurecimento das faixas, tint = brilho branco por cima, base = escurecimento geral da capa
const GLASS_PRESETS = {
  dark: { dim: 0.58, tint: 0.04, base: 0.32 },
  normal: { dim: 0.38, tint: 0.1, base: 0.22 },
  light: { dim: 0.2, tint: 0.2, base: 0.12 },
};

// Ícone do Spotify na pílula: emoji do próprio bot (baixado do CDN do Discord e guardado em memória).
// Para trocar, mude o ID abaixo. Se não carregar, desenha o logo à mão.
const SPOTIFY_EMOJI_ID = "1571194086109487216";
const SPOTIFY_EMOJI_URL = `https://cdn.discordapp.com/emojis/${SPOTIFY_EMOJI_ID}.png?size=128&quality=lossless`;
let emojiPromise = null;
const loadSpotifyEmoji = () => (emojiPromise ??= loadImageFromUrl(SPOTIFY_EMOJI_URL).then((img) => {
  if (!img) emojiPromise = null; // tenta de novo na próxima vez
  return img;
}));

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

// Faixa de vidro: a capa já desfocada (blurred) recortada na área + escurecimento, brilho leve e borda fina.
function glass(ctx, blurred, x, y, w, h, radius, tint, dim) {
  ctx.save();
  roundRect(ctx, x, y, w, h, radius);
  ctx.clip();
  ctx.drawImage(blurred, -MARGIN, -MARGIN);
  ctx.fillStyle = `rgba(0, 0, 0, ${dim})`;
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

// Cor mais marcante da capa para a barra de progresso (a mais viva, nem escura nem lavada demais).
// Reduz a capa para 24x24 e dá mais peso aos pixels coloridos. Retorna "#rrggbb" ou null (usa o verde).
function coverAccent(cover) {
  if (!cover) return null;
  const size = 24;
  const small = createCanvas(size, size);
  const sctx = small.getContext("2d");
  sctx.drawImage(cover, 0, 0, size, size);
  const { data } = sctx.getImageData(0, 0, size, size);

  let r = 0;
  let g = 0;
  let b = 0;
  let weight = 0;
  for (let i = 0; i < data.length; i += 4) {
    const max = Math.max(data[i], data[i + 1], data[i + 2]);
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
    const sat = max === 0 ? 0 : (max - min) / max;
    const w = sat * sat * (0.35 + max / 255) + 0.001; // cores vivas pesam mais que cinzas
    r += data[i] * w;
    g += data[i + 1] * w;
    b += data[i + 2] * w;
    weight += w;
  }
  if (!weight) return null;
  r /= weight;
  g /= weight;
  b /= weight;

  // Capa quase toda cinza (sem cor de verdade): fica no verde do Spotify
  if (Math.max(r, g, b) - Math.min(r, g, b) < 18) return null;

  // Garante uma cor viva e clara o bastante para aparecer sobre o fundo escuro
  let [h, sat, l] = rgbToHsl(r, g, b);
  sat = Math.max(sat, 0.55);
  l = Math.min(0.68, Math.max(0.5, l));
  const [nr, ng, nb] = hslToRgb(h, sat, l);
  return `#${[nr, ng, nb].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h, s, l) {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const hue = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3) * 255, hue(p, q, h) * 255, hue(p, q, h - 1 / 3) * 255];
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
// opcoes (painel do n!menu): { barColor: "green" | "cover", showPill, showNowPlaying, glass: "dark" | "normal" | "light" }
async function renderSpotifyCard(dados, opcoes = {}) {
  const { title, artists, coverUrl, positionMs, durationMs, userName, avatarUrl } = dados;
  const showPill = opcoes.showPill ?? true;
  const showNowPlaying = opcoes.showNowPlaying ?? true;
  const preset = GLASS_PRESETS[opcoes.glass] ?? GLASS_PRESETS.normal;
  // Sem a faixa "Ouvindo agora", o texto e a barra descem para ocupar o espaço dela
  const dy = showNowPlaying ? 0 : 34;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  const [cover, avatar, emoji] = await Promise.all([
    loadImageFromUrl(coverUrl),
    loadImageFromUrl(avatarUrl),
    loadSpotifyEmoji(),
  ]);

  // Pinta a capa (recorte central) ou um degradê escuro, em uma área de largura "w"
  const paintBackdrop = (c, w, h) => {
    if (cover) {
      c.drawImage(cover, 0, -(w - h) / 2 - 30, w, w);
    } else {
      const g = c.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#1f3a2a");
      g.addColorStop(1, "#0b0b0b");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }
  };

  // Cópia desfocada da capa, feita uma vez só (o desfoque é a parte mais pesada do desenho)
  const rawW = W + MARGIN * 2;
  const rawH = H + MARGIN * 2;
  const raw = createCanvas(rawW, rawH);
  paintBackdrop(raw.getContext("2d"), rawW, rawH);
  const blurred = createCanvas(rawW, rawH);
  const bctx = blurred.getContext("2d");
  bctx.filter = "blur(22px)";
  bctx.drawImage(raw, 0, 0);

  // Cantos arredondados do card inteiro
  roundRect(ctx, 0, 0, W, H, 34);
  ctx.clip();
  paintBackdrop(ctx, W, H);

  // Escurecimento geral + degradê forte embaixo (legibilidade do texto)
  ctx.fillStyle = `rgba(0, 0, 0, ${preset.base})`;
  ctx.fillRect(0, 0, W, H);
  const shade = ctx.createLinearGradient(0, 200, 0, H);
  shade.addColorStop(0, "rgba(0, 0, 0, 0)");
  shade.addColorStop(0.55, "rgba(0, 0, 0, 0.62)");
  shade.addColorStop(1, "rgba(0, 0, 0, 0.9)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 200, W, H - 200);

  // Pílula "Spotify" de vidro
  if (showPill) {
    glass(ctx, blurred, 40, 34, 168, 44, 22, preset.tint, preset.dim);
    if (emoji) ctx.drawImage(emoji, 50, 41, 30, 30);
    else spotifyLogo(ctx, 66, 56, 14);
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold 19px ${BOLD}`;
    ctx.textBaseline = "middle";
    ctx.fillText("Spotify", 88, 57);
  }

  // Título (diminui a fonte se for grande) e artistas
  ctx.textBaseline = "alphabetic";
  let titleSize = 56;
  ctx.font = `bold ${titleSize}px ${BOLD}`;
  while (titleSize > 36 && ctx.measureText(title).width > 1000) {
    titleSize -= 2;
    ctx.font = `bold ${titleSize}px ${BOLD}`;
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillText(fitText(ctx, title, 1000), 48, 372 + dy);

  ctx.font = `bold 27px ${BOLD}`;
  ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
  ctx.fillText(fitText(ctx, artists, 1000), 48, 408 + dy);

  // Barra de progresso
  const barX = 46;
  const barW = W - 92;
  const barY = 436 + dy;
  const barColor = opcoes.barColor === "cover" ? (coverAccent(cover) ?? GREEN) : GREEN;
  const ratio = durationMs > 0 ? Math.min(1, Math.max(0, positionMs / durationMs)) : 0;
  const filled = barW * ratio;

  ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
  roundRect(ctx, barX, barY, barW, 7, 4);
  ctx.fill();
  ctx.fillStyle = barColor;
  roundRect(ctx, barX, barY, Math.max(filled, 7), 7, 4);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(barX + filled, barY + 3.5, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = `bold 15px ${BOLD}`;
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.textAlign = "left";
  ctx.fillText(formatTime(positionMs), barX, 472 + dy);
  ctx.textAlign = "right";
  ctx.fillText(formatTime(durationMs), barX + barW, 472 + dy);
  ctx.textAlign = "left";

  // Rodapé de vidro: "Ouvindo agora" + foto e nome de quem está ouvindo
  if (showNowPlaying) {
    glass(ctx, blurred, 30, 486, W - 60, 46, 23, preset.tint * 0.8, preset.dim);
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
  }

  return canvas.encode("png"); // assíncrono: não trava o bot enquanto gera o PNG
}

module.exports = { renderSpotifyCard, formatTime };
