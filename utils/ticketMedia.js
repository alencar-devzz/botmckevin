const TicketImage = require("../database/models/TicketImage");
const { MAX_IMAGES } = require("./ticketSettings");

const MAX_FILE_BYTES = 4 * 1024 * 1024; // por imagem
const MAX_TOTAL_BYTES = 8 * 1024 * 1024; // soma das imagens de uma mensagem (limite de upload do Discord)

const EXT_BY_TYPE = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

// Uma "fonte" de imagem é um link (http...) ou um envio guardado no MongoDB ("db:<id>")
const isStored = (source) => String(source).startsWith("db:");
const storedId = (source) => String(source).slice(3);

// Transforma as fontes em itens para a galeria + arquivos para anexar na mensagem.
// withData=false só resolve os nomes (não carrega os bytes do MongoDB).
async function loadMedia(sources, prefix, { withData = false } = {}) {
  const ids = sources.filter(isStored).map(storedId);
  let query = ids.length ? TicketImage.find({ _id: { $in: ids } }) : null;
  if (query && !withData) query = query.select("-data");
  const docs = query ? await query : [];
  const byId = new Map(docs.map((d) => [String(d._id), d]));

  const items = [];
  const files = [];
  sources.forEach((source, index) => {
    if (!isStored(source)) {
      items.push(source);
      return;
    }
    const doc = byId.get(storedId(source));
    if (!doc) return; // o envio foi removido do banco
    const name = `${prefix}-${index + 1}.${doc.ext}`;
    items.push(`attachment://${name}`);
    if (withData) files.push({ attachment: Buffer.from(doc.data), name });
  });

  return { items, files };
}

// Imagens do painel externo e do ticket interno de uma vez
async function loadTicketMedia(settings, options = {}) {
  const [panel, internal] = await Promise.all([
    loadMedia(settings.panelImages, "painel", options),
    loadMedia(settings.internalImages, "ticket", options),
  ]);
  return { panel, internal };
}

// Baixa e guarda as imagens enviadas no modal. Retorna os ids guardados e os motivos de recusa.
async function saveUploads({ guildId, scope, files, existingSources, room }) {
  const stored = [];
  const rejected = [];

  const existingIds = existingSources.filter(isStored).map(storedId);
  const existingDocs = existingIds.length
    ? await TicketImage.find({ _id: { $in: existingIds } }).select("size")
    : [];
  let total = existingDocs.reduce((sum, d) => sum + d.size, 0);

  for (const file of files) {
    const name = file.name ?? "imagem";
    const type = String(file.contentType ?? "").split(";")[0].toLowerCase();
    const ext = EXT_BY_TYPE[type];

    if (stored.length >= room) {
      rejected.push(`${name}: limite de ${MAX_IMAGES} imagens`);
      continue;
    }
    if (!ext) {
      rejected.push(`${name}: formato não suportado (use png, jpg, gif ou webp)`);
      continue;
    }
    if (file.size > MAX_FILE_BYTES || total + file.size > MAX_TOTAL_BYTES) {
      rejected.push(`${name}: muito pesada (máx. 4 MB por imagem e 8 MB no total)`);
      continue;
    }

    try {
      const response = await fetch(file.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = Buffer.from(await response.arrayBuffer());
      if (data.length > MAX_FILE_BYTES) {
        rejected.push(`${name}: muito pesada (máx. 4 MB por imagem)`);
        continue;
      }

      const doc = await TicketImage.create({
        guildId,
        scope,
        name,
        contentType: type,
        ext,
        size: data.length,
        data,
      });
      stored.push(String(doc._id));
      total += data.length;
    } catch (err) {
      console.error("[TICKET IMAGENS] Erro ao baixar imagem:", err.message);
      rejected.push(`${name}: não consegui baixar a imagem`);
    }
  }

  return { stored, rejected };
}

// Apaga do MongoDB os envios que estavam nessas fontes
async function deleteUploads(sources) {
  const ids = sources.filter(isStored).map(storedId);
  if (ids.length) await TicketImage.deleteMany({ _id: { $in: ids } });
}

// Nome amigável de cada fonte (para listar nos selects dos modais de imagens)
async function describeSources(sources) {
  const ids = sources.filter(isStored).map(storedId);
  const docs = ids.length ? await TicketImage.find({ _id: { $in: ids } }).select("name size") : [];
  const byId = new Map(docs.map((d) => [String(d._id), d]));

  return sources.map((source, index) => {
    if (isStored(source)) {
      const doc = byId.get(storedId(source));
      return {
        label: `${index + 1}. ${doc?.name ?? "imagem enviada"}`.slice(0, 100),
        description: doc ? `Enviada · ${Math.max(1, Math.round(doc.size / 1024))} KB` : "Enviada (arquivo indisponível)",
      };
    }
    return {
      label: `${index + 1}. ${String(source).replace(/^https?:\/\//i, "")}`.slice(0, 100),
      description: "Link",
    };
  });
}

module.exports = {
  isStored,
  loadMedia,
  loadTicketMedia,
  saveUploads,
  deleteUploads,
  describeSources,
};
