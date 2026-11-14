const NukeAsset = require("../../database/models/NukeAsset");

// Imagem enviada (upload) para a miniatura da mensagem do nnuke.
// Mesma lógica do "Criador de mensagens" (utils/msgBuilder/store.js), só que com um arquivo
// por servidor em vez de um rascunho por pessoa.

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB, igual ao limite de imagem do Criador de mensagens
const IMAGE_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/gif": "gif", "image/webp": "webp" };

const baseType = (file) => String(file.contentType ?? "").split(";")[0].trim().toLowerCase();
const nameExt = (file) => String(file.name ?? "").split(".").pop().toLowerCase();

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

// Guarda (substitui) a miniatura enviada para este servidor. Devolve { ok: true } ou { error }.
async function saveNukeThumbnail(guildId, file) {
  const byName = { png: "png", jpg: "jpg", jpeg: "jpg", gif: "gif", webp: "webp" }[nameExt(file)];
  const ext = IMAGE_TYPES[baseType(file)] ?? (baseType(file) ? null : byName);
  if (!ext) return { error: "Formato não suportado. Use png, jpg, gif ou webp." };
  if (file.size > MAX_BYTES) return { error: "Imagem muito pesada. O máximo é 4 MB." };

  try {
    const data = await download(file.url);
    if (data.length > MAX_BYTES) return { error: "Imagem muito pesada. O máximo é 4 MB." };
    await NukeAsset.findOneAndUpdate(
      { guildId },
      { guildId, contentType: baseType(file) || `image/${ext}`, ext, size: data.length, data },
      { upsert: true, setDefaultsOnInsert: true }
    );
    return { ok: true };
  } catch (err) {
    console.error("[NUKE] Erro ao baixar a miniatura:", err.message);
    return { error: "Não consegui baixar essa imagem. Tente enviar de novo." };
  }
}

// { contentType, ext, size, data } ou null
async function getNukeThumbnail(guildId) {
  return NukeAsset.findOne({ guildId }).lean();
}

async function dropNukeThumbnail(guildId) {
  await NukeAsset.deleteOne({ guildId });
}

module.exports = { saveNukeThumbnail, getNukeThumbnail, dropNukeThumbnail };
