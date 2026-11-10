const {
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
} = require("discord.js");
const MessageAsset = require("../../database/models/MessageAsset");
const { LIMITS, LAYOUTS, colorValue, isStored, storedId } = require("./store");

// Monta a mensagem final (Components V2) a partir do rascunho.
// Marcadores no texto: [separador] = linha fina · [separador_largo] = espaço grande.

// ---------- texto ----------

// Quebra o texto nos marcadores. Devolve itens { type: "text", value } e { type: "sep", large }.
function chunkText(raw) {
  const parts = String(raw ?? "").split(/\[(separador_largo|separador)\]/i);
  const items = [];
  parts.forEach((part, i) => {
    if (i % 2 === 0) {
      const value = part.trim();
      if (value) items.push({ type: "text", value });
      return;
    }
    const large = part.toLowerCase() === "separador_largo";
    const last = items[items.length - 1];
    if (!last) return; // sem separador no começo
    if (last.type === "sep") {
      last.large = last.large || large;
      return;
    }
    items.push({ type: "sep", large });
  });
  while (items.length && items[items.length - 1].type === "sep") items.pop();
  return items;
}

const textLength = (raw) => chunkText(raw).reduce((n, item) => n + (item.type === "text" ? item.value.length : 0), 0);
const totalTextLength = (blocks) => blocks.reduce((n, b) => n + textLength(b.text), 0);

const blockHasContent = (b) => Boolean(textLength(b.text) || b.image || b.buttons?.length);

// ---------- emoji de botão ----------

// Aceita emoji unicode ou personalizado (<:nome:id> / <a:nome:id>)
function parseEmoji(raw) {
  const v = String(raw ?? "").trim();
  if (!v) return { value: null };
  const custom = v.match(/^<(a?):([A-Za-z0-9_]{2,32}):(\d{17,20})>$/);
  if (custom) return { value: { animated: Boolean(custom[1]), name: custom[2], id: custom[3] } };
  const unicode = /^(?:\p{Extended_Pictographic}[\uFE0F\u200D\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}]*|\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3)$/u;
  if (unicode.test(v)) return { value: v };
  return { error: true };
}

// ---------- arquivos ----------

async function loadAssets(sources, withData) {
  const ids = [...new Set(sources.filter(isStored).map(storedId))];
  if (!ids.length) return new Map();
  let query = MessageAsset.find({ _id: { $in: ids } });
  if (!withData) query = query.select("-data");
  const docs = await query;
  return new Map(docs.map((d) => [String(d._id), d]));
}

const STYLES = {
  secondary: ButtonStyle.Secondary,
  primary: ButtonStyle.Primary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
};

// ---------- bloco ----------

function buildBlock(block, bi, media, ctx) {
  const layout = LAYOUTS[block.layout] ? block.layout : "box";
  const large = Boolean(block.wide);
  const image = media(block.image, `bloco${bi + 1}-imagem`);
  const thumb = layout === "image" ? null : media(block.thumb, `bloco${bi + 1}-miniatura`);

  const sep = (isLarge) => {
    ctx.count += 1;
    return new SeparatorBuilder().setDivider(true).setSpacing(isLarge ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);
  };

  const content = [];

  // texto (a miniatura vai ao lado do primeiro trecho de texto)
  if (layout !== "image") {
    let sectionUsed = false;
    for (const item of chunkText(block.text)) {
      if (item.type === "sep") {
        content.push(sep(item.large));
      } else if (thumb && !sectionUsed) {
        sectionUsed = true;
        ctx.count += 3; // seção + texto + miniatura
        content.push(
          new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(item.value))
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumb))
        );
      } else {
        ctx.count += 1;
        content.push(new TextDisplayBuilder().setContent(item.value));
      }
    }
    if (thumb && !sectionUsed) ctx.warnings.push(`Bloco ${bi + 1}: a miniatura só aparece quando há texto.`);
  }

  // imagem principal
  if (image) {
    if (content.length) content.push(sep(large));
    ctx.count += 2; // galeria + item
    content.push(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(image)));
  }

  // botões
  const makeRow = (list) => {
    ctx.count += 1 + list.length;
    return new ActionRowBuilder().addComponents(
      ...list.map(({ btn, index }) => {
        const button = new ButtonBuilder();
        const label = String(btn.label ?? "").trim();
        if (label) button.setLabel(label.slice(0, 80));
        const emoji = parseEmoji(btn.emoji).value;
        if (emoji) button.setEmoji(emoji);

        if (btn.url) return button.setStyle(ButtonStyle.Link).setURL(btn.url);
        // sem link = botão decorativo (o clique não faz nada)
        return button.setStyle(STYLES[btn.style] ?? ButtonStyle.Secondary).setCustomId(`msg:deco:${bi}:${index}`);
      })
    );
  };

  const buttons = (block.buttons ?? []).map((btn, index) => ({ btn, index })).filter(({ btn }) => btn.label || btn.emoji);
  const inside = buttons.filter(({ btn }) => btn.place !== "below");
  const below = buttons.filter(({ btn }) => btn.place === "below");

  if (layout === "box") {
    const color = colorValue(block.color);
    const container = new ContainerBuilder();
    ctx.count += 1;
    if (color !== null) container.setAccentColor(color);

    const add = (component) => {
      if (component instanceof TextDisplayBuilder) container.addTextDisplayComponents(component);
      else if (component instanceof SeparatorBuilder) container.addSeparatorComponents(component);
      else if (component instanceof SectionBuilder) container.addSectionComponents(component);
      else if (component instanceof MediaGalleryBuilder) container.addMediaGalleryComponents(component);
      else if (component instanceof ActionRowBuilder) container.addActionRowComponents(component);
    };

    content.forEach(add);
    if (inside.length) {
      if (content.length) add(sep(large));
      add(makeRow(inside));
    }
    const out = [container];
    if (below.length) out.push(makeRow(below));
    return out;
  }

  // "solto" e "só imagem": tudo fica solto na mensagem
  const out = [...content];
  if (buttons.length) out.push(makeRow(buttons));
  return out;
}

// ---------- mensagem inteira ----------

// withData=false não carrega os bytes dos arquivos (serve para o resumo e a checagem de limites).
async function renderDraft(draft, { withData = false } = {}) {
  const ctx = { count: 0, warnings: [] };
  const problems = [];

  const sources = [draft.audio?.source];
  for (const b of draft.blocks) sources.push(b.image, b.thumb);
  const assets = await loadAssets(sources.filter(Boolean), withData);

  const files = [];
  const media = (source, prefix) => {
    if (!source) return null;
    if (!isStored(source)) return source;
    const doc = assets.get(storedId(source));
    if (!doc) {
      problems.push(`Uma imagem salva não foi encontrada (${prefix}). Envie de novo.`);
      return null;
    }
    const name = `${prefix}.${doc.ext}`;
    if (withData) files.push(new AttachmentBuilder(Buffer.from(doc.data), { name }));
    return `attachment://${name}`;
  };

  const components = [];
  let visualBlocks = 0;
  draft.blocks.forEach((block, bi) => {
    if (!blockHasContent(block)) return;
    visualBlocks += 1;
    components.push(...buildBlock(block, bi, media, ctx));
  });

  // áudio
  let audio = null;
  if (draft.audio?.source) {
    const doc = assets.get(storedId(draft.audio.source));
    if (!doc) problems.push("O áudio salvo não foi encontrado. Envie de novo.");
    else audio = { name: draft.audio.name || `audio.${doc.ext}`, buffer: withData ? Buffer.from(doc.data) : null };
  }

  if (!visualBlocks && !audio) problems.push("Falta conteúdo: nenhum bloco tem texto, imagem ou botão e não há áudio.");
  if (ctx.count > LIMITS.components) {
    problems.push(`A mensagem passa de ${LIMITS.components} componentes (tem ${ctx.count}). Tire separadores, botões ou blocos.`);
  }

  return {
    components,
    files,
    audio,
    count: ctx.count,
    visualBlocks,
    problems,
    warnings: ctx.warnings,
    ready: problems.length === 0,
  };
}

module.exports = { chunkText, textLength, totalTextLength, blockHasContent, parseEmoji, renderDraft };
