const {
  EmbedBuilder,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  ThumbnailBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  AttachmentBuilder,
} = require("discord.js");
const { DEFAULTS, DEFAULT_EMBED_COLOR } = require("./defaults");
const { getNukeThumbnail } = require("./asset");

const isUrl = (value) => /^https?:\/\/\S+$/i.test(String(value ?? "").trim());

// "#fff" / "ff00aa" / "#FF00AA" -> número (ou null)
function parseColor(value) {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(value ?? "").trim());
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join("");
  return parseInt(hex, 16);
}

// Troca as {variáveis}. Variável desconhecida fica como foi digitada.
function fill(template, vars) {
  return String(template ?? "").replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match
  );
}

// [separador] / [separador_largo] / [espaco] (também aceita com chaves: {separador}, ...)
const TOKEN_REGEX = /(?:\[|\{)(separador_largo|separador|espaco)(?:\]|\})/gi;
const TEXT_LINE = "▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬";
const MAX_COMPONENTS = 38; // o Discord aceita 40 por mensagem (contando o que fica dentro)
const MAX_TEXT_TOTAL = 3900; // o Discord aceita 4000 caracteres somando todos os textos

const isBlank = (value) => !value || !String(value).trim();

// Quebra o texto em blocos: { type: "text" | "sep" | "sep_large" | "space" }
function parseBlocks(raw) {
  const value = String(raw ?? "");
  const blocks = [];
  let cursor = 0;

  const pushText = (chunk) => {
    const trimmed = chunk.replace(/^\s*\n/, "").replace(/\s+$/, "");
    if (!isBlank(trimmed)) blocks.push({ type: "text", value: trimmed });
  };

  for (const match of value.matchAll(TOKEN_REGEX)) {
    pushText(value.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    const name = match[1].toLowerCase();
    blocks.push({ type: name === "separador" ? "sep" : name === "separador_largo" ? "sep_large" : "space" });
  }
  pushText(value.slice(cursor));
  return blocks;
}

// Nos modos Texto e Embed não existe separador de verdade: vira uma linha
const flatten = (raw) =>
  String(raw ?? "")
    .replace(TOKEN_REGEX, (m, name) => (name.toLowerCase() === "espaco" ? "\u200b" : TEXT_LINE))
    .trim();

const unix = (date) => Math.floor(date.getTime() / 1000);
const stamp = (date, style) => `<t:${unix(date)}:${style}>`;

// Devolve { url } (link ou "attachment://...") e, se for um arquivo enviado, também { file } para
// entrar em payload.files. setting === "upload" busca a imagem guardada em utils/nuke/asset.js.
async function resolveThumbnail(setting, ctx) {
  if (isUrl(setting)) return { url: String(setting).trim() };
  if (setting === "avatar") return { url: ctx.executor?.displayAvatarURL?.({ extension: "png", size: 256 }) ?? null };
  if (setting === "server") return { url: ctx.guild?.iconURL?.({ extension: "png", size: 256 }) ?? null };
  if (setting === "upload") {
    const asset = await getNukeThumbnail(ctx.guild?.id);
    if (!asset) return { url: null }; // configurado para "enviada" mas nada foi enviado ainda
    const name = `nuke-thumb.${asset.ext}`;
    return { url: `attachment://${name}`, file: new AttachmentBuilder(Buffer.from(asset.data), { name }) };
  }
  return { url: null };
}

/**
 * Monta a mensagem enviada no canal novo.
 * ctx = { guild, executor: GuildMember, channel (o novo), oldChannelId, categoryName, now: Date }
 */
async function buildNukeMessage(cfg, ctx) {
  const now = ctx.now ?? new Date();
  const executor = ctx.executor;
  const vars = {
    executor: `<@${executor.id}>`,
    executor_nome: executor.displayName ?? executor.user?.username ?? "",
    executor_id: executor.id,
    horario: stamp(now, "F"),
    horario_curto: stamp(now, "f"),
    horario_relativo: stamp(now, "R"),
    hora: stamp(now, "t"),
    data: stamp(now, "D"),
    canal: `<#${ctx.channel.id}>`,
    canal_nome: ctx.channel.name ?? "",
    canal_antigo_id: String(ctx.oldChannelId ?? ""),
    categoria: ctx.categoryName ?? "Nenhuma",
    servidor: ctx.guild?.name ?? "",
  };
  const f = (value) => fill(value, vars);

  const payload = {
    allowedMentions: { parse: [], users: cfg.pingExecutor ? [executor.id] : [] },
  };
  const accent = parseColor(cfg.color);
  const { url: thumb, file: thumbFile } = await resolveThumbnail(cfg.thumbnail, ctx);
  if (thumbFile) payload.files = [thumbFile];

  // ---------- Texto ----------
  if (cfg.mode === "text") {
    const body = flatten(f(cfg.text)) || flatten(fill(DEFAULTS.text, vars));
    payload.content = body.slice(0, 2000);
    return payload;
  }

  // ---------- Embed ----------
  if (cfg.mode === "embed") {
    const embed = new EmbedBuilder().setColor(accent ?? parseColor(DEFAULT_EMBED_COLOR));
    const title = flatten(f(cfg.embedTitle)).slice(0, 256);
    const description = flatten(f(cfg.embedDescription)).slice(0, 4096);
    const footer = flatten(f(cfg.embedFooter)).slice(0, 2048);
    if (title) embed.setTitle(title);
    if (description) embed.setDescription(description);
    if (footer) embed.setFooter({ text: footer });
    if (thumb) embed.setThumbnail(thumb);
    if (isUrl(cfg.image)) embed.setImage(String(cfg.image).trim());
    if (cfg.embedTimestamp) embed.setTimestamp(now);

    // Embed vazia o Discord recusa: cai no texto padrão
    const d = embed.data;
    if (!d.title && !d.description && !d.footer && !d.image && !d.thumbnail) {
      embed.setDescription(flatten(fill(DEFAULTS.embedDescription, vars)));
    }
    payload.embeds = [embed];
    if (cfg.pingExecutor) payload.content = `<@${executor.id}>`;
    return payload;
  }

  // ---------- Container (Components V2) ----------
  const raw = f(cfg.containerText).trim() ? f(cfg.containerText) : fill(DEFAULTS.containerText, vars);
  const blocks = parseBlocks(raw);

  const container = new ContainerBuilder();
  if (accent !== null) container.setAccentColor(accent);

  let used = 1; // o próprio container
  let chars = 0;
  let first = true;

  for (const b of blocks) {
    if (used >= MAX_COMPONENTS) break;

    if (b.type === "text") {
      const content = b.value.slice(0, Math.min(3500, MAX_TEXT_TOTAL - chars));
      if (isBlank(content)) break;
      chars += content.length;
      const display = new TextDisplayBuilder().setContent(content);
      // A miniatura (ThumbnailBuilder) fica ao lado do primeiro texto
      if (first && thumb) {
        used += 3; // seção + texto + miniatura
        container.addSectionComponents(
          new SectionBuilder().addTextDisplayComponents(display).setThumbnailAccessory(new ThumbnailBuilder().setURL(thumb))
        );
      } else {
        used += 1;
        container.addTextDisplayComponents(display);
      }
    } else if (b.type === "sep") {
      container.addSeparatorComponents(new SeparatorBuilder());
      used += 1;
    } else if (b.type === "sep_large") {
      container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large));
      used += 1;
    } else {
      container.addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Large));
      used += 1;
    }
    first = false;
  }

  // Container vazio o Discord recusa: usa uma mensagem mínima
  if (used === 1) container.addTextDisplayComponents(new TextDisplayBuilder().setContent("\u200b"));

  if (isUrl(cfg.image) && used + 2 <= 40) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(String(cfg.image).trim()))
    );
  }

  payload.components = [container];
  payload.flags = MessageFlags.IsComponentsV2;
  return payload;
}

module.exports = { buildNukeMessage, parseColor, isUrl, fill };
