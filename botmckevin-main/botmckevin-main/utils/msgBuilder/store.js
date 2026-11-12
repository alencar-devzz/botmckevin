const MessageDraft = require("../../database/models/MessageDraft");
const MessageAsset = require("../../database/models/MessageAsset");

// Limites do Criador de mensagens
const LIMITS = {
  blocks: 5,
  buttons: 2,
  respButtons: 3, // botões de link dentro de uma resposta
  respText: { text: 2000, embed: 4000, v2: 3800 }, // limite de texto por tipo de resposta
  respTitle: 256,
  respFooter: 2048,
  textTotal: 4000, // soma do texto de todos os blocos (limite do Discord para Components V2)
  components: 40, // limite de componentes por mensagem (contando os aninhados)
  imageBytes: 4 * 1024 * 1024,
  imageTotalBytes: 8 * 1024 * 1024,
  audioBytes: 8 * 1024 * 1024,
};

const LAYOUTS = {
  box: { label: "Caixa", desc: "Caixa com barra de cor" },
  plain: { label: "Solto", desc: "Sem caixa, texto e imagem soltos" },
  image: { label: "Só imagem", desc: "Apenas a imagem e os botões" },
};

const COLORS = {
  rosa: { label: "Rosa", value: 0xeb459f },
  roxo: { label: "Roxo", value: 0x9b59b6 },
  blurple: { label: "Blurple", value: 0x5865f2 },
  verde: { label: "Verde", value: 0x57f287 },
  amarelo: { label: "Amarelo", value: 0xfee75c },
  vermelho: { label: "Vermelho", value: 0xed4245 },
  grafite: { label: "Grafite", value: 0x2b2d31 },
};

const BUTTON_STYLES = { secondary: "Cinza", primary: "Azul", success: "Verde", danger: "Vermelho" };
const PLACES = { inside: "Dentro da caixa", below: "Embaixo da caixa" };

// O que o botão faz ao ser clicado (só botões sem link)
const RESPONSE_MODES = {
  none: { label: "Sem resposta", desc: "O botão fica só decorativo" },
  text: { label: "Texto puro", desc: "Mensagem simples, sem caixa" },
  embed: { label: "Embed", desc: "Embed clássico, com título, cor e imagem" },
  v2: { label: "Componentes V2", desc: "Caixa moderna com texto, imagem e botões" },
};

// ---------- respostas de botão ----------

const newResponse = () => ({
  mode: "none",
  text: "",
  title: "",
  footer: "",
  image: null,
  thumb: null,
  color: null,
  hidden: true,
  buttons: [],
});

function normalizeResponse(raw) {
  const r = raw ?? {};
  const str = (v) => String(v ?? "");
  return {
    mode: r.mode in RESPONSE_MODES ? r.mode : "none",
    text: str(r.text),
    title: str(r.title),
    footer: str(r.footer),
    image: r.image || null,
    thumb: r.thumb || null,
    color: r.color || null,
    hidden: r.hidden !== false,
    buttons: (r.buttons ?? []).slice(0, LIMITS.respButtons).map((b) => ({ label: str(b.label), url: str(b.url), emoji: str(b.emoji) })),
  };
}

// Botão com resposta configurada (botão de link nunca responde, ele só abre o link)
const hasResponse = (btn) => Boolean(btn && !btn.url && btn.response && btn.response.mode && btn.response.mode !== "none");

// A resposta tem algo para mostrar?
function responseHasContent(r) {
  if (!r || r.mode === "none") return false;
  if (String(r.text ?? "").trim() || r.image || (r.buttons ?? []).some((b) => b.url)) return true;
  return r.mode === "embed" && Boolean(String(r.title ?? "").trim() || String(r.footer ?? "").trim());
}

const responseSources = (r) => [r?.image, r?.thumb].filter(Boolean);
const buttonSources = (btn) => responseSources(btn?.response);
const blockSources = (b) => [b.image, b.thumb, ...(b.buttons ?? []).flatMap(buttonSources)].filter(Boolean);

// ---------- cores ----------

// Aceita #RGB ou #RRGGBB. Devolve "#RRGGBB" em maiúsculas ou null.
function parseHex(raw) {
  let v = String(raw ?? "").trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(v)) v = v.split("").map((c) => c + c).join("");
  return /^[0-9a-f]{6}$/i.test(v) ? `#${v.toUpperCase()}` : null;
}

function colorValue(color) {
  if (!color) return null;
  if (COLORS[color]) return COLORS[color].value;
  const hex = parseHex(color);
  return hex ? parseInt(hex.slice(1), 16) : null;
}

const colorLabel = (color) => (!color ? "sem cor" : COLORS[color]?.label ?? parseHex(color) ?? "sem cor");

// ---------- rascunho ----------

const newBlock = () => ({
  text: "",
  image: null,
  thumb: null,
  layout: "box",
  color: null,
  wide: false,
  buttons: [],
});

function normalize(doc) {
  const raw = doc?.blocks?.length ? doc.blocks : [null];
  const blocks = raw.slice(0, LIMITS.blocks).map((b) => ({
    ...newBlock(),
    ...(b ?? {}),
    buttons: (b?.buttons ?? []).slice(0, LIMITS.buttons).map((x) => ({ ...x, response: normalizeResponse(x.response) })),
  }));
  const cursor = Math.min(Math.max(Number(doc?.cursor) || 0, 0), blocks.length - 1);
  return {
    blocks,
    audio: { source: doc?.audio?.source ?? null, name: doc?.audio?.name ?? null },
    channelId: doc?.channelId ?? null,
    cursor,
    btnCursor: Math.min(Math.max(Number(doc?.btnCursor) || 0, 0), Math.max(LIMITS.buttons - 1, 0)),
  };
}

async function getDraft(guildId, userId) {
  const doc = await MessageDraft.findOne({ guildId, userId }).lean();
  return normalize(doc);
}

async function saveDraft(guildId, userId, draft) {
  const clean = normalize(draft);
  await MessageDraft.findOneAndUpdate(
    { guildId, userId },
    { $set: clean },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return clean;
}

async function deleteDraft(guildId, userId) {
  await MessageDraft.deleteOne({ guildId, userId });
}

// ---------- arquivos guardados ----------

const isStored = (source) => String(source ?? "").startsWith("db:");
const storedId = (source) => String(source).slice(3);

const IMAGE_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/gif": "gif", "image/webp": "webp" };
const AUDIO_EXTS = ["mp3", "wav", "m4a", "ogg", "mp4", "mov", "webm"];
const AUDIO_TYPES = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/ogg": "ogg",
  "application/ogg": "ogg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

const baseType = (file) => String(file.contentType ?? "").split(";")[0].trim().toLowerCase();
const nameExt = (file) => String(file.name ?? "").split(".").pop().toLowerCase();

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

// Guarda uma imagem enviada. Devolve { source } ou { error }.
async function saveImage({ guildId, userId, file }) {
  const byName = { png: "png", jpg: "jpg", jpeg: "jpg", gif: "gif", webp: "webp" }[nameExt(file)];
  const ext = IMAGE_TYPES[baseType(file)] ?? (baseType(file) ? null : byName);
  if (!ext) return { error: "Formato não suportado. Use png, jpg, gif ou webp." };
  if (file.size > LIMITS.imageBytes) return { error: "Imagem muito pesada. O máximo é 4 MB por imagem." };

  const used = await MessageAsset.aggregate([
    { $match: { guildId, userId, kind: "image", published: { $ne: true } } },
    { $group: { _id: null, total: { $sum: "$size" } } },
  ]);
  if ((used[0]?.total ?? 0) + file.size > LIMITS.imageTotalBytes) {
    return { error: "O rascunho já guarda muitas imagens (máx. 8 MB no total). Remova alguma antes." };
  }

  try {
    const data = await download(file.url);
    if (data.length > LIMITS.imageBytes) return { error: "Imagem muito pesada. O máximo é 4 MB por imagem." };
    const doc = await MessageAsset.create({
      guildId,
      userId,
      kind: "image",
      name: String(file.name ?? "imagem").slice(0, 100),
      contentType: baseType(file) || `image/${ext}`,
      ext,
      size: data.length,
      data,
    });
    return { source: `db:${doc._id}` };
  } catch (err) {
    console.error("[MENSAGEM] Erro ao baixar imagem:", err.message);
    return { error: "Não consegui baixar essa imagem. Tente enviar de novo." };
  }
}

// Guarda o áudio (ou vídeo) do rascunho. Devolve { source, name } ou { error }.
async function saveAudio({ guildId, userId, file }) {
  const type = baseType(file);
  const fromName = AUDIO_EXTS.includes(nameExt(file)) ? nameExt(file) : null;
  const ext = AUDIO_TYPES[type] ?? fromName;
  if (!ext) return { error: "Formato não suportado. Use MP3, WAV, M4A, OGG ou um vídeo (MP4, MOV, WEBM)." };
  if (file.size > LIMITS.audioBytes) return { error: "Arquivo muito pesado. O máximo é 8 MB." };

  try {
    const data = await download(file.url);
    if (data.length > LIMITS.audioBytes) return { error: "Arquivo muito pesado. O máximo é 8 MB." };
    const base = String(file.name ?? "audio").replace(/\.[^.]*$/, "").replace(/[^\w\- ]+/g, "_").trim().slice(0, 60) || "audio";
    const name = `${base}.${ext}`;
    const doc = await MessageAsset.create({
      guildId,
      userId,
      kind: "audio",
      name,
      contentType: type,
      ext,
      size: data.length,
      data,
    });
    return { source: `db:${doc._id}`, name };
  } catch (err) {
    console.error("[MENSAGEM] Erro ao baixar áudio:", err.message);
    return { error: "Não consegui baixar esse arquivo. Tente enviar de novo." };
  }
}

// Apaga do MongoDB os arquivos dessas fontes (links são ignorados)
async function dropSources(sources) {
  const ids = [...new Set(sources.filter(isStored).map(storedId))];
  if (ids.length) await MessageAsset.deleteMany({ _id: { $in: ids } });
}

// Copia um arquivo guardado (usado ao publicar: a resposta publicada fica independente do rascunho).
// Links são devolvidos como estão. Devolve null se o arquivo original não existir mais.
async function cloneAsset(source) {
  if (!isStored(source)) return source;
  const doc = await MessageAsset.findById(storedId(source));
  if (!doc) return null;
  const copy = await MessageAsset.create({
    guildId: doc.guildId,
    userId: doc.userId,
    kind: doc.kind,
    name: doc.name,
    contentType: doc.contentType,
    ext: doc.ext,
    size: doc.size,
    data: doc.data,
    published: true,
  });
  return `db:${copy._id}`;
}

// Fontes de arquivos guardados em uso num rascunho
function draftSources(draft) {
  const list = [draft.audio?.source];
  for (const b of draft.blocks) list.push(...blockSources(b));
  return list.filter(Boolean);
}

module.exports = {
  LIMITS,
  LAYOUTS,
  COLORS,
  BUTTON_STYLES,
  PLACES,
  RESPONSE_MODES,
  newResponse,
  normalizeResponse,
  hasResponse,
  responseHasContent,
  responseSources,
  buttonSources,
  blockSources,
  cloneAsset,
  parseHex,
  colorValue,
  colorLabel,
  newBlock,
  getDraft,
  saveDraft,
  deleteDraft,
  isStored,
  storedId,
  saveImage,
  saveAudio,
  dropSources,
  draftSources,
};
