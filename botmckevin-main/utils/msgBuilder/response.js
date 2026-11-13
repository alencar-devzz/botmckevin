const {
  EmbedBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  ThumbnailBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  MessageFlags,
} = require("discord.js");
const MessageButtonResponse = require("../../database/models/MessageButtonResponse");
const {
  LIMITS,
  colorValue,
  isStored,
  storedId,
  hasResponse,
  normalizeResponse,
  responseHasContent,
  cloneAsset,
  dropSources,
  responseSources,
} = require("./store");
const { chunkText, parseEmoji, loadAssets, blockHasContent } = require("./render");

// Respostas de botão do Criador de mensagens.
// Três formatos: texto puro, embed e Componentes V2. Cada um pode ter imagem, cor (embed e V2)
// e botões de link. Este arquivo monta a resposta, guarda uma cópia ao publicar e envia no clique.

const MAX_V2_ITEMS = 20;

// Linha com os botões de link da resposta (ou null se não houver nenhum válido)
function linkRow(buttons) {
  const list = (buttons ?? []).filter((b) => b.url && (String(b.label ?? "").trim() || String(b.emoji ?? "").trim()));
  if (!list.length) return null;
  return new ActionRowBuilder().addComponents(
    ...list.slice(0, LIMITS.respButtons).map((b) => {
      const button = new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(b.url);
      const label = String(b.label ?? "").trim();
      if (label) button.setLabel(label.slice(0, 80));
      const emoji = parseEmoji(b.emoji).value;
      if (emoji) button.setEmoji(emoji);
      return button;
    })
  );
}

// Monta a mensagem da resposta. Devolve { payload, problems }.
// payload (sem flags de ephemeral): { content?, embeds?, components?, files, flags? }
async function buildResponse(raw, { withData = true, assets: preloaded = null } = {}) {
  const resp = normalizeResponse(raw);
  if (resp.mode === "none") return { payload: null, problems: [] };
  if (!responseHasContent(resp)) return { payload: null, problems: ["A resposta está vazia."] };

  const problems = [];
  const assets = preloaded ?? (await loadAssets([resp.image, resp.thumb].filter(Boolean), withData));
  const files = [];

  // Link vira o próprio endereço; arquivo guardado vira anexo
  const media = (source, name) => {
    if (!source) return null;
    if (!isStored(source)) return source;
    const doc = assets.get(storedId(source));
    if (!doc) {
      problems.push("Uma imagem da resposta não foi encontrada.");
      return null;
    }
    const file = `${name}.${doc.ext}`;
    if (withData) files.push(new AttachmentBuilder(Buffer.from(doc.data), { name: file }));
    return `attachment://${file}`;
  };

  const row = linkRow(resp.buttons);
  const text = resp.text.trim();
  const color = colorValue(resp.color);

  // ----- texto puro -----
  if (resp.mode === "text") {
    let content = text.slice(0, LIMITS.respText.text);
    const image = media(resp.image, "resposta-imagem");
    if (image && !image.startsWith("attachment://")) {
      // link de imagem: o Discord mostra a prévia do endereço
      content = `${content}${content ? "\n" : ""}${image}`.slice(0, LIMITS.respText.text);
    }
    const payload = { files };
    if (content) payload.content = content;
    if (row) payload.components = [row];
    return { payload, problems };
  }

  // ----- embed -----
  if (resp.mode === "embed") {
    const embed = new EmbedBuilder();
    const title = resp.title.trim();
    const footer = resp.footer.trim();
    const image = media(resp.image, "resposta-imagem");
    const thumb = media(resp.thumb, "resposta-miniatura");

    let filled = false;
    if (title) {
      embed.setTitle(title.slice(0, LIMITS.respTitle));
      filled = true;
    }
    if (text) {
      embed.setDescription(text.slice(0, LIMITS.respText.embed));
      filled = true;
    }
    if (image) {
      embed.setImage(image);
      filled = true;
    }
    if (footer) {
      embed.setFooter({ text: footer.slice(0, LIMITS.respFooter) });
      filled = true;
    }
    if (filled && thumb) embed.setThumbnail(thumb);
    if (color !== null) embed.setColor(color);

    const payload = { files };
    if (filled) payload.embeds = [embed];
    if (row) payload.components = [row];
    return { payload, problems };
  }

  // ----- Componentes V2 -----
  const image = media(resp.image, "resposta-imagem");
  const thumb = media(resp.thumb, "resposta-miniatura");
  const container = new ContainerBuilder();
  if (color !== null) container.setAccentColor(color);

  let children = 0;
  let sectionUsed = false;
  for (const item of chunkText(text.slice(0, LIMITS.respText.v2)).slice(0, MAX_V2_ITEMS)) {
    if (item.type === "sep") {
      container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(item.large ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small));
    } else if (thumb && !sectionUsed) {
      sectionUsed = true;
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(item.value))
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumb))
      );
    } else {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(item.value));
    }
    children += 1;
  }

  const gap = () => container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  if (image) {
    if (children) gap();
    container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(image)));
    children += 1;
  }
  if (row) {
    if (children) gap();
    container.addActionRowComponents(row);
    children += 1;
  }
  if (!children) return { payload: null, problems: ["A resposta está vazia."] };

  return { payload: { components: [container], files, flags: MessageFlags.IsComponentsV2 }, problems };
}

// Responde ao clique. ephemeral = só quem clicou vê.
async function sendResponse(interaction, raw, { ephemeral = true, assets = null } = {}) {
  const { payload, problems } = await buildResponse(raw, { withData: true, assets });
  if (!payload) {
    return interaction
      .reply({ content: problems[0] ?? "Esse botão não tem resposta.", flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } })
      .catch(() => {});
  }

  const flags = (payload.flags ?? 0) | (ephemeral ? MessageFlags.Ephemeral : 0);
  if (flags) payload.flags = flags;
  else delete payload.flags;
  payload.allowedMentions = { parse: [] }; // a resposta nunca marca ninguém
  return interaction.reply(payload);
}

// ---------- respostas das mensagens publicadas ----------

// As respostas publicadas nunca mudam (são cópias), então ficam em memória junto com os bytes das imagens.
// O primeiro clique depois de reiniciar o bot busca no banco; os seguintes respondem na hora.
const CACHE_MAX_ITEMS = 300;
const CACHE_MAX_BYTES = 40 * 1024 * 1024;
const cache = new Map(); // id -> { resp, assets, bytes } (o mais antigo fica no começo)
const loading = new Map(); // id -> Promise (evita buscar duas vezes se clicarem seguido)
let cacheBytes = 0;

function cacheDrop(id) {
  const entry = cache.get(id);
  if (!entry) return;
  cache.delete(id);
  cacheBytes -= entry.bytes;
}

function cachePut(id, entry) {
  cacheDrop(id);
  cache.set(id, entry);
  cacheBytes += entry.bytes;
  while ((cache.size > CACHE_MAX_ITEMS || cacheBytes > CACHE_MAX_BYTES) && cache.size > 1) {
    cacheDrop(cache.keys().next().value);
  }
}

async function fetchPublished(id) {
  const doc = await MessageButtonResponse.findById(id).select("response").lean();
  if (!doc?.response) return null;
  const resp = normalizeResponse(doc.response);
  const assets = await loadAssets(responseSources(resp), true);
  const bytes = 2000 + [...assets.values()].reduce((n, a) => n + (a.size || 0), 0);
  return { resp, assets, bytes };
}

// Resposta pronta para enviar: { resp, assets } ou null se não existir mais
async function getPublished(id) {
  if (!/^[0-9a-f]{24}$/i.test(id)) return null;

  const hit = cache.get(id);
  if (hit) {
    cachePut(id, hit); // marca como usada recentemente
    return hit;
  }

  if (!loading.has(id)) {
    loading.set(
      id,
      fetchPublished(id)
        .then((entry) => {
          if (entry) cachePut(id, entry);
          return entry;
        })
        .finally(() => loading.delete(id))
    );
  }
  return loading.get(id);
}

// Guarda uma cópia da resposta de cada botão que responde. Devolve Map "bloco:botão" -> id.
async function createPublishedResponses({ guildId, channelId, userId, draft }) {
  const ids = new Map();
  try {
    for (let bi = 0; bi < draft.blocks.length; bi += 1) {
      const block = draft.blocks[bi];
      if (!blockHasContent(block)) continue;

      for (let i = 0; i < block.buttons.length; i += 1) {
        const btn = block.buttons[i];
        if (!(btn.label || btn.emoji) || !hasResponse(btn)) continue;

        const resp = normalizeResponse(btn.response);
        const sources = [];
        for (const field of ["image", "thumb"]) {
          if (!resp[field]) continue;
          const copy = await cloneAsset(resp[field]);
          resp[field] = copy;
          if (copy && isStored(copy)) sources.push(copy);
        }

        const doc = await MessageButtonResponse.create({ guildId, channelId, userId, response: resp, sources });
        ids.set(`${bi}:${i}`, String(doc._id));
      }
    }
  } catch (err) {
    await discardResponses([...ids.values()]).catch(() => {});
    throw err;
  }
  return ids;
}

// Liga as respostas à mensagem publicada
async function attachResponses(ids, messageId) {
  const list = [...ids.values()];
  if (list.length) await MessageButtonResponse.updateMany({ _id: { $in: list } }, { $set: { messageId } });
  // já deixa as respostas em memória: o primeiro clique também responde rápido
  for (const id of list) getPublished(id).catch(() => {});
}

// Apaga respostas (e as imagens copiadas delas) pelos ids dos documentos
async function discardResponses(ids) {
  if (!ids.length) return;
  ids.forEach(cacheDrop);
  const docs = await MessageButtonResponse.find({ _id: { $in: ids } }).select("sources");
  await dropSources(docs.flatMap((d) => d.sources));
  await MessageButtonResponse.deleteMany({ _id: { $in: ids } });
}

// Quando a mensagem publicada é apagada, as respostas dos botões dela deixam de ser necessárias
async function purgeMessages(messageIds) {
  if (!messageIds.length) return;
  const docs = await MessageButtonResponse.find({ messageId: { $in: messageIds } }).select("_id");
  if (docs.length) await discardResponses(docs.map((d) => String(d._id)));
}

module.exports = {
  buildResponse,
  sendResponse,
  createPublishedResponses,
  attachResponses,
  discardResponses,
  purgeMessages,
  getPublished,
};
