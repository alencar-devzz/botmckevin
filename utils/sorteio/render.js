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
const { chunkText, parseEmoji, loadAssets } = require("../msgBuilder/render");
const { isStored, storedId, colorValue } = require("../msgBuilder/store");
const D = require("./defaults");

// Monta a mensagem pública do sorteio (Components V2) a partir do documento.
// A prévia usa o mesmo caminho, só que com botões que não fazem nada.

const STYLES = {
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
};

const unix = (date) => Math.floor(new Date(date).getTime() / 1000);

// ---------- textos ----------

function describeRules(doc) {
  const r = doc.req ?? {};
  const need = [];
  if (r.callMin > 0) need.push(`${r.callMin} min em call`);
  if (r.messages > 0) need.push(`${r.messages} mensagens`);
  if (r.invites > 0) need.push(`${r.invites} convite(s)`);
  if ((r.where ?? []).length) {
    const parts = [];
    if (r.where.includes("status") && (r.patterns ?? []).length) parts.push(`status com ${r.patterns.map((p) => `\`${p}\``).join(" ou ")}`);
    if (r.where.includes("tag")) parts.push("tag do servidor");
    if (parts.length) need.push(parts.join(" ou "));
  }
  return need;
}

function rulesBlock(doc) {
  const lines = [];
  const need = describeRules(doc);
  if (need.length) lines.push(`**Para entrar**\n-# ${need.join(" · ")}`);
  const extras = (doc.extras ?? []).filter((e) => e.roleId);
  if (extras.length) lines.push(`**Chances extras**\n-# ${extras.map((e) => `<@&${e.roleId}> +${e.extra}`).join(" · ")}`);
  return lines.join("\n");
}

function resultBlock(doc, preview) {
  if (doc.status === "ended") {
    if (!doc.winnerIds?.length) return "**Resultado**\n-# Ninguém válido se inscreveu, então não houve vencedores.";
    return `**Vencedores**\n${doc.winnerIds.map((id) => `<@${id}>`).join(" ")}`;
  }
  return preview ? "-# O resultado aparece aqui quando o sorteio terminar." : "";
}

function variables(doc, { preview = false } = {}) {
  const ends = doc.endsAt
    ? `<t:${unix(doc.endsAt)}:R>`
    : doc.durationMs
    ? `${formatSpan(doc.durationMs)} depois de publicado`
    : "sem prazo definido";
  return {
    premio: doc.prize || "Prêmio não definido",
    participantes: String(doc.entries?.length ?? 0),
    termino: ends,
    numero_de_ganhadores: String(doc.winners ?? 1),
    responsavel: doc.hostId ? `<@${doc.hostId}>` : "equipe",
    regras: rulesBlock(doc),
    resultado: resultBlock(doc, preview),
  };
}

function fill(text, vars) {
  return String(text ?? "")
    .replace(/\{(\w+)\}/g, (match, key) => (key in vars ? vars[key] : match))
    .replace(/\n{3,}/g, "\n\n");
}

function formatSpan(ms) {
  const units = [
    ["d", 86400000],
    ["h", 3600000],
    ["min", 60000],
    ["s", 1000],
  ];
  const out = [];
  let left = Math.max(0, ms);
  for (const [name, size] of units) {
    const n = Math.floor(left / size);
    if (n > 0) {
      out.push(`${n}${name === "min" ? " min" : name}`);
      left -= n * size;
    }
    if (out.length === 2) break;
  }
  return out.join(" ") || "0s";
}

// ---------- botões ----------

function makeButton(spec, defaultLabel, vars, customId, disabled) {
  const label = fill(spec?.label || "", vars).trim();
  const emoji = parseEmoji(spec?.emoji).value;
  const button = new ButtonBuilder().setCustomId(customId).setStyle(STYLES[spec?.style] ?? ButtonStyle.Secondary).setDisabled(Boolean(disabled));
  const shown = label || (emoji ? "" : fill(defaultLabel, vars));
  if (shown) button.setLabel(shown.slice(0, 80));
  if (emoji) button.setEmoji(emoji);
  return button;
}

function buttonRow(doc, vars, preview) {
  const ended = doc.status === "ended";
  const buttons = [];
  if (doc.entryMode !== "reaction") {
    buttons.push(
      makeButton(doc.mainButton, D.DEFAULT_MAIN_LABEL, vars, preview ? "sr:noop:main" : `sr:join:${doc._id}`, ended)
    );
  }
  if (doc.partButton?.visible !== false) {
    buttons.push(
      makeButton(doc.partButton, D.DEFAULT_PART_LABEL, vars, preview ? "sr:noop:part" : `sr:pl:${doc._id}:0`, false)
    );
  }
  return buttons.length ? new ActionRowBuilder().addComponents(...buttons) : null;
}

// ---------- mensagem ----------

// withData=false não baixa os arquivos (serve para a checagem de problemas)
async function buildMessage(doc, { preview = false, withData = true } = {}) {
  const vars = variables(doc, { preview });
  const problems = [];
  const files = [];
  let count = 0;

  const sources = doc.blocks.flatMap((b) => [b.image, b.thumb]).filter(Boolean);
  const assets = await loadAssets(sources, withData);
  const media = (source, name) => {
    if (!source) return null;
    if (!isStored(source)) return source;
    const stored = assets.get(storedId(source));
    if (!stored) {
      problems.push(`Uma imagem salva (${name}) não foi encontrada. Envie de novo.`);
      return null;
    }
    const file = `${name}.${stored.ext}`;
    if (withData) files.push(new AttachmentBuilder(Buffer.from(stored.data), { name: file }));
    return `attachment://${file}`;
  };

  const row = buttonRow(doc, vars, preview);
  const insideRow = row && doc.place !== "below" ? row : null;
  const belowRow = row && doc.place === "below" ? row : null;

  const top = [];
  let lastVisible = -1;
  const rendered = doc.blocks.map((block, bi) => {
    const chunks = chunkText(fill(block.text, vars));
    const image = media(block.image, `bloco${bi + 1}-imagem`);
    const thumb = media(block.thumb, `bloco${bi + 1}-miniatura`);
    const has = chunks.length > 0 || Boolean(image);
    if (has) lastVisible = bi;
    return { block, chunks, image, thumb, has };
  });

  rendered.forEach(({ block, chunks, image, thumb, has }, bi) => {
    if (!has) return;
    const items = [];
    const sep = (large) => {
      count += 1;
      return new SeparatorBuilder().setDivider(true).setSpacing(large ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);
    };

    let used = false;
    for (const item of chunks) {
      if (item.type === "sep") items.push(sep(item.large));
      else if (thumb && !used) {
        used = true;
        count += 3;
        items.push(
          new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(item.value))
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumb))
        );
      } else {
        count += 1;
        items.push(new TextDisplayBuilder().setContent(item.value));
      }
    }
    if (thumb && !used) problems.push(`Bloco ${bi + 1}: a miniatura só aparece quando o bloco tem texto.`);

    if (image) {
      if (items.length) items.push(sep(block.wide));
      count += 2;
      items.push(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(image)));
    }

    const withButtons = insideRow && bi === lastVisible;
    if (withButtons) {
      items.push(sep(false));
      count += 1 + insideRow.components.length;
      items.push(insideRow);
    }

    if (doc.layout === "loose") {
      top.push(...items);
      return;
    }

    const container = new ContainerBuilder();
    count += 1;
    const color = colorValue(block.color);
    if (color !== null) container.setAccentColor(color);
    for (const part of items) {
      if (part instanceof TextDisplayBuilder) container.addTextDisplayComponents(part);
      else if (part instanceof SeparatorBuilder) container.addSeparatorComponents(part);
      else if (part instanceof SectionBuilder) container.addSectionComponents(part);
      else if (part instanceof MediaGalleryBuilder) container.addMediaGalleryComponents(part);
      else if (part instanceof ActionRowBuilder) container.addActionRowComponents(part);
    }
    top.push(container);
  });

  if (lastVisible < 0) {
    problems.push("Falta conteúdo: nenhum bloco tem texto ou imagem.");
  } else if (doc.layout === "loose" && insideRow) {
    // no layout solto "dentro" já foi colocado no último bloco; nada a fazer
  }
  if (belowRow) {
    count += 1 + belowRow.components.length;
    top.push(belowRow);
  }

  const textTotal = rendered.reduce((n, r) => n + r.chunks.reduce((m, c) => m + (c.type === "text" ? c.value.length : 0), 0), 0);
  if (textTotal > D.LIMITS.text) problems.push(`O texto passa de ${D.LIMITS.text} caracteres (tem ${textTotal}). Encurte os blocos.`);
  if (count > D.LIMITS.components) problems.push(`A mensagem passa de ${D.LIMITS.components} componentes (tem ${count}). Tire separadores ou blocos.`);

  return { components: top, files, problems, count };
}

// Texto da DM do ganhador
function buildDmText(doc, { winnerId, guildName, link }) {
  const vars = {
    ganhador: `<@${winnerId}>`,
    premio: doc.prize,
    sorteio: doc.name,
    servidor: guildName,
    responsavel: doc.hostId ? `<@${doc.hostId}>` : "a equipe",
    link: link ?? "",
  };
  return fill(doc.dm?.text || D.DEFAULT_DM, vars).slice(0, D.LIMITS.dm + 400);
}

// ---------- mensagem do ganhador (vai para o canal ao encerrar) ----------

function winnerVars(doc, { winners, guildName, link }) {
  return {
    premio: doc.prize || "Prêmio não definido",
    vencedores: winners.length ? winners.map((id) => `<@${id}>`).join(" ") : "ninguém",
    lista_vencedores: winners.length ? winners.map((id) => `- <@${id}>`).join("\n") : "ninguém",
    numero_de_ganhadores: String(doc.winners ?? 1),
    participantes: String(doc.entries?.length ?? 0),
    sorteio: doc.name || "Sorteio",
    servidor: guildName || "o servidor",
    responsavel: doc.hostId ? `<@${doc.hostId}>` : "a equipe",
    link: link ?? "",
    encerramento: `<t:${unix(new Date())}:f>`,
  };
}

function winnerText(doc, winners, reroll) {
  const win = doc.win ?? {};
  if (!winners.length) return win.textEmpty || D.DEFAULT_WIN_EMPTY;
  return (reroll ? win.textReroll || D.DEFAULT_WIN_REROLL : win.text || D.DEFAULT_WIN_TEXT);
}

async function buildWinnerMessage(doc, { winners = [], reroll = false, guildName = "", link = "", withData = true } = {}) {
  const win = doc.win ?? {};
  const vars = winnerVars(doc, { winners, guildName, link });
  const problems = [];
  const files = [];

  const assets = await loadAssets([win.image, win.thumb].filter(Boolean), withData);
  const media = (source, name) => {
    if (!source) return null;
    if (!isStored(source)) return source;
    const stored = assets.get(storedId(source));
    if (!stored) {
      problems.push(`A imagem salva (${name}) não foi encontrada. Envie de novo.`);
      return null;
    }
    const file = `${name}.${stored.ext}`;
    if (withData) files.push(new AttachmentBuilder(Buffer.from(stored.data), { name: file }));
    return `attachment://${file}`;
  };
  const image = media(win.image, "ganhador-imagem");
  const thumb = media(win.thumb, "ganhador-miniatura");

  const chunks = chunkText(fill(winnerText(doc, winners, reroll), vars));
  const items = [];
  let thumbUsed = false;
  for (const item of chunks) {
    if (item.type === "sep") {
      items.push(new SeparatorBuilder().setDivider(true).setSpacing(item.large ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small));
    } else if (thumb && !thumbUsed) {
      thumbUsed = true;
      items.push(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(item.value))
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumb))
      );
    } else {
      items.push(new TextDisplayBuilder().setContent(item.value));
    }
  }
  if (thumb && !thumbUsed) problems.push("A miniatura só aparece quando a mensagem tem texto.");
  if (image) {
    if (items.length) items.push(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    items.push(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(image)));
  }
  if (!items.length) problems.push("A mensagem do ganhador ficou sem conteúdo.");

  if (link && win.button?.visible !== false) {
    const label = fill(win.button?.label || "", vars).trim();
    const emoji = parseEmoji(win.button?.emoji).value;
    const button = new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(link);
    const shown = label || (emoji ? "" : D.DEFAULT_WIN_BUTTON);
    if (shown) button.setLabel(shown.slice(0, 80));
    if (emoji) button.setEmoji(emoji);
    items.push(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    items.push(new ActionRowBuilder().addComponents(button));
  }

  const textTotal = chunks.reduce((n, c) => n + (c.type === "text" ? c.value.length : 0), 0);
  if (textTotal > D.LIMITS.text) problems.push(`O texto passa de ${D.LIMITS.text} caracteres (tem ${textTotal}).`);

  if (win.layout === "loose") return { components: items, files, problems };

  const container = new ContainerBuilder().setAccentColor(colorValue(win.color) ?? D.DEFAULT_WIN_COLOR);
  for (const part of items) {
    if (part instanceof TextDisplayBuilder) container.addTextDisplayComponents(part);
    else if (part instanceof SeparatorBuilder) container.addSeparatorComponents(part);
    else if (part instanceof SectionBuilder) container.addSectionComponents(part);
    else if (part instanceof MediaGalleryBuilder) container.addMediaGalleryComponents(part);
    else if (part instanceof ActionRowBuilder) container.addActionRowComponents(part);
  }
  return { components: [container], files, problems };
}

module.exports = { buildMessage, buildWinnerMessage, buildDmText, describeRules, formatSpan, variables, fill, unix };
