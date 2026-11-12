const {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} = require("discord.js");
const { applyVariables } = require("./formatMessage");
const { loadMedia } = require("./ticketMedia");
const { isUrl } = require("./portariaSettings");

// Marcadores que podem ser digitados no título, na mensagem e no rodapé:
//   {separador}        linha separadora
//   {separador_largo}  linha separadora com mais espaço
//   {espaco}           espaço em branco (sem linha)
//   {imagem}           todas as imagens da mensagem, nesse ponto
//   {imagem1}..{imagem5} uma imagem específica, nesse ponto
//   {avatar}           foto do membro, nesse ponto
//   {icone}            ícone do servidor, nesse ponto
const TOKEN_REGEX = /\{(separador_largo|separador|espaco|imagem\d*|avatar|icone)\}/gi;

const TOKENS = [
  ["{separador}", "Linha separadora"],
  ["{separador_largo}", "Separador com mais espaço"],
  ["{espaco}", "Espaço em branco, sem linha"],
  ["{imagem}", "Todas as imagens da mensagem"],
  ["{imagem1}…{imagem5}", "Uma imagem específica"],
  ["{avatar}", "Foto do membro"],
  ["{icone}", "Ícone do servidor"],
];

const MAX_COMPONENTS = 38; // o Discord aceita 40 por mensagem (contando o que fica dentro)
const MAX_TEXT_TOTAL = 3900; // o Discord aceita 4000 caracteres somando todos os textos
const TEXT_LINE = "▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬";

const isBlank = (value) => !value || !String(value).trim();

// Quebra o texto em blocos: { type: "text" | "sep" | "sep_large" | "space" | "image" | "avatar" | "icon" }
function parseBlocks(raw, { prefix = "" } = {}) {
  const value = String(raw ?? "");
  const blocks = [];
  let cursor = 0;

  const pushText = (chunk) => {
    const trimmed = chunk.replace(/^\s*\n/, "").replace(/\s+$/, "");
    if (!isBlank(trimmed)) blocks.push({ type: "text", value: trimmed, prefix });
  };

  for (const match of value.matchAll(TOKEN_REGEX)) {
    pushText(value.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    const name = match[1].toLowerCase();
    if (name === "separador") blocks.push({ type: "sep" });
    else if (name === "separador_largo") blocks.push({ type: "sep_large" });
    else if (name === "espaco") blocks.push({ type: "space" });
    else if (name === "avatar") blocks.push({ type: "avatar" });
    else if (name === "icone") blocks.push({ type: "icon" });
    else {
      const number = Number.parseInt(name.slice("imagem".length), 10);
      blocks.push({ type: "image", number: Number.isInteger(number) ? number : null });
    }
  }
  pushText(value.slice(cursor));
  return blocks;
}

const usesImageToken = (blocks) => blocks.some((b) => b.type === "image");

function memberAvatar(member, size = 1024) {
  return (member.user ?? member).displayAvatarURL({ extension: "png", size });
}

function thumbnailUrl(thumb, member) {
  if (isUrl(thumb)) return thumb;
  if (thumb === "avatar") return memberAvatar(member, 256);
  if (thumb === "server") return member.guild?.iconURL({ extension: "png", size: 256 }) ?? null;
  return null;
}

function gallery(urls) {
  return new MediaGalleryBuilder().addItems(
    urls.slice(0, 10).map((url) => new MediaGalleryItemBuilder().setURL(url))
  );
}

// Monta a mensagem pronta para enviar (canal ou DM).
// settings = resultado de resolveSettings(); kind só serve para nomear os arquivos anexados.
async function buildPortariaPayload(kind, member, settings) {
  const { style, title, message, footer, color, thumb, images } = settings;
  const media = await loadMedia(images, `portaria-${kind}`, { withData: true });
  const urls = media.items;
  const files = media.files;

  // Título e mensagem formam um bloco só (o título é só texto, do jeito que foi digitado)
  const headRaw = [title, message].filter((part) => !isBlank(part)).join("\n");
  const head = parseBlocks(headRaw);
  const foot = parseBlocks(footer, { prefix: "-# " });
  const autoGallery = urls.length && ![...head, ...foot].some((b) => b.type === "image");

  const blocks = [...head];
  if (autoGallery) blocks.push({ type: "image", number: null });
  blocks.push(...foot);

  // ---------- formato Texto (mensagem comum) ----------
  if (style === "text") {
    const lines = blocks
      .map((b) => {
        if (b.type === "text") return `${b.prefix}${applyVariables(b.value, member)}`;
        if (b.type === "sep" || b.type === "sep_large") return TEXT_LINE;
        if (b.type === "space") return "\u200b";
        return null;
      })
      .filter((line) => line !== null);

    // Imagens enviadas viram anexos; imagens de link entram no texto (o Discord mostra a prévia)
    const links = urls.filter((url) => !url.startsWith("attachment://"));
    const content = [...lines, ...links].join("\n").trim().slice(0, 2000) || "\u200b";
    return { content, files };
  }

  // ---------- formato Container ----------
  const container = new ContainerBuilder();
  if (color != null) container.setAccentColor(color); // sem cor por padrão

  let used = 1; // o próprio container
  let chars = 0;

  const addText = (b) => {
    if (used >= MAX_COMPONENTS || chars >= MAX_TEXT_TOTAL) return false;
    const full = `${b.prefix}${applyVariables(b.value, member)}`;
    const content = full.slice(0, Math.min(3500, MAX_TEXT_TOTAL - chars));
    if (isBlank(content)) return false;
    chars += content.length;
    used += 1;
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
    return true;
  };

  const pick = (b) => {
    if (b.type === "avatar") return [memberAvatar(member)];
    if (b.type === "icon") {
      const icon = member.guild?.iconURL({ extension: "png", size: 1024 });
      return icon ? [icon] : [];
    }
    // {imagem} = todas; {imagemN} = só a N
    if (b.number != null) return [urls[b.number - 1]].filter(Boolean);
    return urls;
  };

  const thumbUrl = style === "container" ? thumbnailUrl(thumb, member) : null;
  let first = true;

  for (const b of blocks) {
    if (used >= MAX_COMPONENTS) break;

    if (b.type === "text") {
      // A miniatura fica ao lado do primeiro texto (se o primeiro bloco for um texto)
      if (first && thumbUrl) {
        const content = `${b.prefix}${applyVariables(b.value, member)}`.slice(0, 3500);
        if (!isBlank(content)) {
          chars += content.length;
          used += 3; // seção + texto + miniatura
          container.addSectionComponents(
            new SectionBuilder()
              .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
              .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbUrl))
          );
        }
      } else addText(b);
    } else if (b.type === "sep") {
      container.addSeparatorComponents(new SeparatorBuilder());
      used += 1;
    } else if (b.type === "sep_large") {
      container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large)
      );
      used += 1;
    } else if (b.type === "space") {
      container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Large)
      );
      used += 1;
    } else {
      const picked = pick(b);
      if (picked.length) {
        container.addMediaGalleryComponents(gallery(picked));
        used += 1 + Math.min(picked.length, 10);
      }
    }
    first = false;
  }

  // Container vazio o Discord recusa: usa uma mensagem mínima
  if (used === 1) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent("\u200b"));
  }

  return { components: [container], files, flags: MessageFlags.IsComponentsV2 };
}

module.exports = { TOKENS, TOKEN_REGEX, parseBlocks, usesImageToken, buildPortariaPayload };
