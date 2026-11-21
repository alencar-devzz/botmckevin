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
  MessageFlags,
} = require("discord.js");
const MessageAsset = require("../../database/models/MessageAsset");
const { LAYOUTS, BUTTON_STYLES, colorValue, isStored, storedId, saveImage, dropSources, responseSources } = require("../msgBuilder/store");
const { chunkText, textLength, parseEmoji, loadAssets } = require("../msgBuilder/render");
const { updatePanel } = require("./store");

// Mensagem pública do painel de "Cargos por perfil".
// Usa as mesmas peças do Criador de mensagens (n!msg): marcadores de separador, imagem, miniatura,
// formato (caixa, solto, só imagem), cor e botões. Aqui há um único bloco por painel.

const V2 = MessageFlags.IsComponentsV2;

const LIMITS = {
  text: 3800, // texto da mensagem (o Discord aceita 4000 no total em Components V2)
  reply: 1500, // resposta de sucesso / falha
  patterns: 10,
  extraButtons: 2,
};

const DEFAULT_TITLE = "Verificação de perfil";
const DEFAULT_DESC = "Clique no botão abaixo para verificar seu perfil.";
const DEFAULT_MESSAGE = `## ${DEFAULT_TITLE}\n[separador]\n${DEFAULT_DESC}`;

const STYLES = {
  secondary: ButtonStyle.Secondary,
  primary: ButtonStyle.Primary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
};

// ---------- texto ----------

// O painel só usa emoji do servidor (<:nome:id>): emoji unicode é removido de tudo que é salvo
const UNICODE_EMOJI = /[←-⇿⌀-⏿☀-➿⬀-⯿\u{1F000}-\u{1FAFF}‍️]/gu;
const stripEmoji = (v) => String(v ?? "").replace(UNICODE_EMOJI, "").replace(/[ \t]{2,}/g, " ").trim();
// Versão para textos longos: não mexe nos espaços (markdown e listas continuam iguais)
const cleanText = (v) => String(v ?? "").replace(UNICODE_EMOJI, "").trim();

const legacyText = (p) =>
  `## ${stripEmoji(p.title) || DEFAULT_TITLE}\n[separador]\n${stripEmoji(p.description) || DEFAULT_DESC}`;

// Painéis antigos não têm os campos novos: tudo passa por aqui antes de ser usado
function normalizePanel(p = {}) {
  const str = (v) => String(v ?? "");
  const extra = (Array.isArray(p.extraButtons) ? p.extraButtons : []).slice(0, LIMITS.extraButtons);
  return {
    ...p,
    // null = painel antigo (usa título + descrição); "" = texto removido de propósito
    message: typeof p.message === "string" ? p.message : legacyText(p),
    image: p.image || null,
    thumb: p.thumb || null,
    layout: LAYOUTS[p.layout] ? p.layout : "box",
    color: p.color || null,
    wide: Boolean(p.wide),
    buttonLabel: typeof p.buttonLabel === "string" ? p.buttonLabel : "Verificar",
    buttonEmoji: p.buttonEmoji || null,
    buttonStyle: p.buttonStyle in BUTTON_STYLES ? p.buttonStyle : "success",
    buttonPlace: p.buttonPlace === "below" ? "below" : "inside",
    extraButtons: extra.map((b) => ({
      label: str(b.label),
      url: str(b.url),
      emoji: str(b.emoji),
      place: b.place === "below" ? "below" : "inside",
    })),
    giveRoles: p.giveRoles ?? [],
    removeRoles: p.removeRoles ?? [],
    patterns: p.patterns ?? [],
    successText: p.successText ?? "",
    failText: p.failText ?? "",
    responses: p.responses && typeof p.responses === "object" ? p.responses : {},
  };
}

// Nome curto do painel para listas: primeira linha do texto, sem markdown
function panelName(p) {
  const first = String(normalizePanel(p).message)
    .split("\n")
    .map((l) => l.replace(/\[(separador_largo|separador)\]/gi, "").replace(/<a?:\w+:\d+>/g, "").replace(/^#{1,3}\s+/, "").replace(/[*_~`|>]/g, "").trim())
    .find(Boolean);
  const name = first || "Painel sem título";
  return name.length > 60 ? `${name.slice(0, 59)}…` : name;
}

// ---------- imagens ----------

// Guarda uma imagem do painel. Fica marcada como "publicada" para não ocupar a cota do rascunho do n!msg.
async function savePanelImage({ guildId, userId, file }) {
  const saved = await saveImage({ guildId, userId, file });
  if (saved.source && isStored(saved.source)) {
    await MessageAsset.updateOne({ _id: storedId(saved.source) }, { $set: { published: true } });
  }
  return saved;
}

const panelSources = (p) => [p?.image, p?.thumb].filter(Boolean);
// Imagens das respostas personalizadas (também precisam ser apagadas junto com o painel)
const responseAssets = (p) => Object.values(p?.responses ?? {}).flatMap((r) => responseSources(r));
const dropPanelAssets = (p) => dropSources([...panelSources(p), ...responseAssets(p)]);

// ---------- montagem ----------

// Monta os componentes da mensagem do painel.
// withData=false não carrega os bytes das imagens (basta para o resumo e a checagem de limites).
// preview=true deixa o botão de verificação desativado (a prévia não pode verificar ninguém).
async function renderPanel(raw, { withData = false, preview = false } = {}) {
  const panel = normalizePanel(raw);
  const ctx = { count: 0 };
  const problems = [];
  const warnings = [];

  const assets = await loadAssets(panelSources(panel), withData);
  const files = [];
  const media = (source, name) => {
    if (!source) return null;
    if (!isStored(source)) return source;
    const doc = assets.get(storedId(source));
    if (!doc) {
      problems.push(`Uma imagem salva não foi encontrada (${name}). Envie de novo.`);
      return null;
    }
    const file = `painel-${name}.${doc.ext}`;
    if (withData) files.push(new AttachmentBuilder(Buffer.from(doc.data), { name: file }));
    return `attachment://${file}`;
  };

  const layout = panel.layout;
  const large = panel.wide;
  const image = media(panel.image, "imagem");
  const thumb = layout === "image" ? null : media(panel.thumb, "miniatura");

  const sep = (isLarge) => {
    ctx.count += 1;
    return new SeparatorBuilder().setDivider(true).setSpacing(isLarge ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);
  };

  const content = [];

  // Não há separador automático: só aparecem os escritos no texto ([separador], [separador_largo]).
  // [imagem] marca onde a imagem fica; sem ele, a imagem vem depois do texto.
  const gallery = () => {
    ctx.count += 2; // galeria + item
    return new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(image));
  };
  let imagePlaced = false;

  if (layout !== "image") {
    let sectionUsed = false;
    for (const item of chunkText(panel.message, { edges: true, image: true })) {
      if (item.type === "sep") {
        content.push(sep(item.large || large));
      } else if (item.type === "image") {
        if (image && !imagePlaced) {
          imagePlaced = true;
          content.push(gallery());
        }
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
    if (thumb && !sectionUsed) warnings.push("A miniatura só aparece quando há texto.");
  }

  if (image && !imagePlaced) content.push(gallery());

  // ----- botões: verificar + links extras -----
  const verifyButton = () => {
    const button = new ButtonBuilder().setCustomId(`bp_verify:${panel.panelId}`).setStyle(STYLES[panel.buttonStyle]);
    const label = panel.buttonLabel.trim();
    const emoji = parseEmoji(panel.buttonEmoji).value;
    if (label) button.setLabel(label.slice(0, 80));
    if (emoji) button.setEmoji(emoji);
    if (!label && !emoji) button.setLabel("Verificar");
    if (preview) button.setDisabled(true);
    return button;
  };

  const linkButton = (b) => {
    const button = new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(b.url);
    const label = b.label.trim();
    const emoji = parseEmoji(b.emoji).value;
    if (label) button.setLabel(label.slice(0, 80));
    if (emoji) button.setEmoji(emoji);
    return button;
  };

  const buttons = [{ place: panel.buttonPlace, make: verifyButton }];
  for (const b of panel.extraButtons) {
    if (b.url && (b.label.trim() || parseEmoji(b.emoji).value)) buttons.push({ place: b.place, make: () => linkButton(b) });
  }
  const inside = buttons.filter((b) => b.place !== "below");
  const below = buttons.filter((b) => b.place === "below");

  const makeRow = (list) => {
    ctx.count += 1 + list.length;
    return new ActionRowBuilder().addComponents(...list.map((b) => b.make()));
  };

  let components;
  if (layout === "box") {
    const container = new ContainerBuilder();
    ctx.count += 1;
    const color = colorValue(panel.color);
    if (color !== null) container.setAccentColor(color);

    for (const c of content) {
      if (c instanceof TextDisplayBuilder) container.addTextDisplayComponents(c);
      else if (c instanceof SeparatorBuilder) container.addSeparatorComponents(c);
      else if (c instanceof SectionBuilder) container.addSectionComponents(c);
      else if (c instanceof MediaGalleryBuilder) container.addMediaGalleryComponents(c);
    }
    if (inside.length) container.addActionRowComponents(makeRow(inside));
    components = [container];
    if (below.length) components.push(makeRow(below));
  } else {
    // "solto" e "só imagem": tudo fica solto na mensagem
    components = [...content, makeRow(buttons)];
  }

  if (layout === "image" && !image) problems.push("O formato Só imagem precisa de uma imagem.");
  else if (!content.some((c) => !(c instanceof SeparatorBuilder))) problems.push("Falta conteúdo: escreva um texto ou envie uma imagem.");
  if (textLength(panel.message) > 4000) problems.push("O texto passa de 4000 caracteres.");
  if (ctx.count > 40) problems.push(`A mensagem passa de 40 componentes (tem ${ctx.count}). Tire separadores ou botões.`);

  return { components, files, problems, warnings, count: ctx.count, ready: problems.length === 0 };
}

// ---------- publicação ----------

// Envia o painel no canal escolhido (apaga a publicação anterior, se houver)
async function publishPanel(guild, raw) {
  const channel = raw.channelId ? guild.channels.cache.get(raw.channelId) : null;
  if (!channel?.isTextBased()) return { error: "Canal não encontrado. Escolha o canal de novo." };

  const report = await renderPanel(raw, { withData: true });
  if (!report.ready) return { error: report.problems[0] };

  if (raw.messageId) await channel.messages.delete(raw.messageId).catch(() => {});
  const message = await channel.send({ components: report.components, files: report.files, flags: V2 });
  await updatePanel(guild.id, raw.panelId, { messageId: message.id, channelId: channel.id });
  return { messageId: message.id };
}

// Edições no editor atualizam a mensagem já publicada na hora.
// Devolve "none" (não publicada), "ok", "invalid" (painel incompleto), "missing" (mensagem sumiu) ou "error".
async function syncPublished(guild, raw) {
  if (!raw?.messageId || !raw?.channelId) return "none";
  try {
    const channel = guild.channels.cache.get(raw.channelId);
    const message = channel?.isTextBased() ? await channel.messages.fetch(raw.messageId).catch(() => null) : null;
    if (!message) {
      await updatePanel(guild.id, raw.panelId, { messageId: null });
      return "missing";
    }
    const report = await renderPanel(raw, { withData: true });
    if (!report.ready) return "invalid";
    // attachments: [] troca os anexos antigos pelos novos
    await message.edit({ components: report.components, files: report.files, attachments: [], flags: V2 });
    return "ok";
  } catch (err) {
    console.error("[BIOPANEL] Falha ao atualizar a mensagem publicada:", err?.message ?? err);
    return "error";
  }
}

module.exports = {
  LIMITS,
  DEFAULT_MESSAGE,
  stripEmoji,
  cleanText,
  normalizePanel,
  panelName,
  savePanelImage,
  panelSources,
  dropPanelAssets,
  responseAssets,
  renderPanel,
  publishPanel,
  syncPublished,
};
