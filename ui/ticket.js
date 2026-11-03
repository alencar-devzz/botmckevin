const {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require("discord.js");
const { applyVars, getOption, DEFAULTS } = require("../utils/ticketSettings");

const text = (content) => new TextDisplayBuilder().setContent(String(content).slice(0, 3000));

const STYLE_MAP = {
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
};

function buildGallery(urls) {
  return new MediaGalleryBuilder().addItems(
    urls.slice(0, 10).map((url) => new MediaGalleryItemBuilder().setURL(url))
  );
}

// Texto informativo do painel (como funciona + categorias)
function infoText(panel) {
  const lines = [
    "**Como funciona**",
    "-# Ao abrir, criamos um tópico privado só para você e a equipe responsável.",
  ];

  if (panel.mode === "select" && panel.options.length > 1) {
    lines.push("", "**Categorias de atendimento**");
    for (const opt of panel.options.slice(0, 8)) {
      lines.push(`• **${opt.label}**${opt.description ? ` · ${opt.description}` : ""}`);
    }
    if (panel.options.length > 8) lines.push(`-# E mais ${panel.options.length - 8} opção(ões) no menu.`);
  }
  return lines.join("\n").slice(0, 1500);
}

// Painel enviado em um canal: imagens + textos + select menu ou botão
// media = { panel: { items } } (de utils/ticketMedia). Sem media, usa só links.
// preview = true deixa os controles desativados (prévia no menu de configuração)
function buildTicketPanel(panel, media = null, { preview = false } = {}) {
  const off = preview || !panel.enabled;
  const container = new ContainerBuilder();
  if (panel.color != null) container.setAccentColor(panel.color);

  const items = media?.panel.items ?? panel.panelImages.filter((u) => /^https?:/i.test(u));
  if (items.length) container.addMediaGalleryComponents(buildGallery(items));

  const head = [];
  if (panel.title) head.push(`### ${panel.title}`);
  if (panel.description) head.push(panel.description);
  if (head.length) container.addTextDisplayComponents(text(head.join("\n")));

  if (panel.showInfo) {
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(text(infoText(panel)));
  }

  if (!panel.enabled) {
    container.addTextDisplayComponents(text("-# Atendimento temporariamente indisponível."));
  }

  if (panel.mode === "button") {
    const opt = panel.options[0];
    const label = (panel.buttonLabel || opt?.label || "Abrir ticket").slice(0, 80);
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_open:${panel.id}`)
          .setLabel(label)
          .setStyle(STYLE_MAP[panel.buttonStyle] ?? ButtonStyle.Primary)
          .setDisabled(off)
      )
    );
  } else {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`ticket_open:${panel.id}`)
      .setDisabled(off)
      .addOptions(
        panel.options.slice(0, 25).map((opt) => {
          const item = { label: opt.label.slice(0, 100), value: opt.key };
          if (opt.description) item.description = opt.description.slice(0, 100);
          return item;
        })
      );
    if (panel.placeholder) select.setPlaceholder(panel.placeholder.slice(0, 150));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(select));
  }

  if (panel.footer) {
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(text(`-# ${panel.footer}`));
  }

  return [container];
}

// Container dentro do tópico do ticket
// record = { number, reason, createdAt } (pode ser null em tickets antigos)
function buildTicketContainer({
  panel,
  option: optionInput,
  author,
  record = null,
  claimedBy = null,
  guildName = "",
  media = null,
}) {
  const opt = optionInput ?? getOption(panel, "geral");
  const vars = {
    user: `<@${author.id}>`,
    username: author.username,
    option: opt.label,
    server: guildName,
    number: record?.number ?? "",
  };

  const heading = applyVars(panel.internalHeading, vars);
  const message = applyVars(opt.message ?? panel.internalMessage, vars);

  // "Assumido por" mostra só o nome (tag) do staff, sem menção
  const claimedName = claimedBy ? String(claimedBy.tag ?? claimedBy.username).replaceAll("`", "'") : null;
  const info = [`**Assumido por:** ${claimedName ? `\`${claimedName}\`` : "`ninguém`"}`];
  if (panel.showAuthorLine) info.push(`**Aberto por:** <@${author.id}>`);
  if (panel.showOptionLine) info.push(`**Opção selecionada:**\n\`\`\`${opt.label}\`\`\``);

  // Textos vazios não geram componente (o Discord recusa texto em branco)
  const sectionTexts = [];
  if (heading) sectionTexts.push(text(`## ${heading}`));
  sectionTexts.push(text(info.join("\n")));

  const section = new SectionBuilder()
    .addTextDisplayComponents(...sectionTexts)
    .setThumbnailAccessory(
      new ThumbnailBuilder().setURL(author.displayAvatarURL({ extension: "png", size: 256 }))
    );

  const container = new ContainerBuilder().addSectionComponents(section);

  const bodyLines = [];
  if (opt.title) bodyLines.push(`## ${opt.title}`);
  if (message) bodyLines.push(message);
  if (bodyLines.length) {
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(text(bodyLines.join("\n ")));
  }

  // Cor fixa, configurável pelo painel. Não muda quando o ticket é assumido.
  if (panel.internalColor != null) container.setAccentColor(panel.internalColor);

  if (record?.reason) {
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(
      text(`**Motivo informado**\n\`\`\`\n${record.reason.slice(0, 600)}\n\`\`\``)
    );
  }

  const items = media?.internal.items ?? panel.internalImages.filter((u) => /^https?:/i.test(u));
  if (items.length) container.addMediaGalleryComponents(buildGallery(items));

  if (panel.showTicketFooter) {
    const footer = [`Painel: ${panel.name}`];
    if (record?.number) footer.push(`Ticket N°${record.number}`);
    if (record?.createdAt) footer.push(`Aberto <t:${Math.floor(new Date(record.createdAt).getTime() / 1000)}:R>`);
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(text(`-# ${footer.join(" · ")}`));
  }

  const claimButton = new ButtonBuilder()
    .setCustomId(`ticket_claim:${author.id}:${panel.id}:${opt.key}`)
    .setLabel(claimedBy ? "Assumido" : "Assumir")
    .setStyle(claimedBy ? ButtonStyle.Secondary : ButtonStyle.Success)
    .setDisabled(Boolean(claimedBy));

  const closeButton = new ButtonBuilder()
    .setCustomId(`ticket_close:${panel.id}:${opt.key}`)
    .setLabel("Finalizar")
    .setStyle(ButtonStyle.Danger);

  return container.addActionRowComponents(new ActionRowBuilder().addComponents(claimButton, closeButton));
}

// Mensagem enviada quando um staff assume o ticket
function buildClaimedContainer({ panel, staffId, authorId, timestamp, guildName = "" }) {
  const body = applyVars(panel.claimedMessage, {
    staff: `<@${staffId}>`,
    user: `<@${authorId}>`,
    server: guildName,
  });

  const container = new ContainerBuilder().addTextDisplayComponents(
    text(`${body ? `### ${body}\n` : ""}-# <t:${timestamp}:t>`)
  );
  if (panel.claimedColor != null) container.setAccentColor(panel.claimedColor);
  return container;
}

// Efêmera de sucesso: título, mensagem e cor configuráveis; botão para o ticket opcional, com label editável
function buildTicketCreatedEphemeral(panel, url, vars = {}) {
  const title = applyVars(panel.successTitle, vars);
  const message = applyVars(panel.successMessage, vars);

  const container = new ContainerBuilder();
  if (title) container.addTextDisplayComponents(text(`### ${title}`));
  if (message) container.addTextDisplayComponents(text(`-# ${message}`));
  // Container não pode ficar vazio: sem texto e sem botão, mantém ao menos o título padrão
  if (!title && !message && !panel.successButtonEnabled) {
    container.addTextDisplayComponents(text(`### ${DEFAULTS.successTitle}`));
  }
  if (panel.successColor != null) container.setAccentColor(panel.successColor);

  if (panel.successButtonEnabled) {
    const link = new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel((panel.successButtonLabel || "Ir para o ticket").slice(0, 80))
      .setURL(url);
    container.addActionRowComponents(new ActionRowBuilder().addComponents(link));
  }

  return [container];
}

// Efêmera quando o usuário atingiu o limite de tickets abertos. Título, mensagem e cor configuráveis.
function buildLimitReached(panel, records) {
  const links = records
    .slice(0, 5)
    .map((r) => `• <#${r.threadId}>`)
    .join("\n");

  const vars = { max: panel.maxPerUser };
  const title = applyVars(panel.limitTitle, vars);
  const message = applyVars(panel.limitMessage, vars);

  const container = new ContainerBuilder();
  if (title) container.addTextDisplayComponents(text(`### ${title}`));
  if (message) container.addTextDisplayComponents(text(`-# ${message}`));
  container.addTextDisplayComponents(text(links));
  if (panel.limitColor != null) container.setAccentColor(panel.limitColor);

  return [container];
}

// Pergunta de confirmação antes de finalizar. Título, mensagem, cor e texto do botão configuráveis.
function buildCloseConfirm(panel, panelId, optionKey) {
  const container = new ContainerBuilder();
  if (panel.closeConfirmTitle) container.addTextDisplayComponents(text(`### ${panel.closeConfirmTitle}`));
  if (panel.closeConfirmMessage) container.addTextDisplayComponents(text(`-# ${panel.closeConfirmMessage}`));
  container
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_closeok:${panelId}:${optionKey}`)
          .setLabel((panel.closeConfirmButtonLabel || "Confirmar").slice(0, 80))
          .setStyle(ButtonStyle.Danger)
      )
    );
  if (panel.closeConfirmColor != null) container.setAccentColor(panel.closeConfirmColor);

  return [container];
}

module.exports = {
  buildTicketPanel,
  buildTicketContainer,
  buildClaimedContainer,
  buildTicketCreatedEphemeral,
  buildLimitReached,
  buildCloseConfirm,
};
