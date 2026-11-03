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
const { applyVars, getOption } = require("../utils/ticketSettings");

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
      .setPlaceholder(panel.placeholder.slice(0, 150))
      .setDisabled(off)
      .addOptions(
        panel.options.slice(0, 25).map((opt) => {
          const item = { label: opt.label.slice(0, 100), value: opt.key };
          if (opt.description) item.description = opt.description.slice(0, 100);
          return item;
        })
      );
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
  const message = applyVars(opt.message || panel.internalMessage, vars);

  const info = [
    `**Aberto por:** <@${author.id}>`,
    `**Assumido por:** ${claimedBy ? `<@${claimedBy.id}>` : "`Ninguém`"}`,
    `**Opção selecionada:** \`${opt.label}\``,
  ];

  const section = new SectionBuilder()
    .addTextDisplayComponents(text(`## ${heading}`), text(info.join("\n")))
    .setThumbnailAccessory(
      new ThumbnailBuilder().setURL(author.displayAvatarURL({ extension: "png", size: 256 }))
    );

  const container = new ContainerBuilder()
    // Verde quando já tem alguém atendendo; sem cor enquanto aguarda
    .addSectionComponents(section)
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(text(`## ${opt.title}\n ${message}`));

  if (claimedBy) container.setAccentColor(0x00c853);

  if (record?.reason) {
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(
      text(`**Motivo informado**\n\`\`\`\n${record.reason.slice(0, 600)}\n\`\`\``)
    );
  }

  const items = media?.internal.items ?? panel.internalImages.filter((u) => /^https?:/i.test(u));
  if (items.length) container.addMediaGalleryComponents(buildGallery(items));

  const footer = [`Painel: ${panel.name}`];
  if (record?.number) footer.push(`Ticket N°${record.number}`);
  if (record?.createdAt) footer.push(`Aberto <t:${Math.floor(new Date(record.createdAt).getTime() / 1000)}:R>`);
  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(text(`-# ${footer.join(" · ")}`));

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

  return new ContainerBuilder()
    .setAccentColor(0x00c853)
    .addTextDisplayComponents(text(`### ${body}\n-# <t:${timestamp}:t>`));
}

// Efêmera de sucesso: título, mensagem e cor configuráveis; botão para o ticket opcional, com label editável
function buildTicketCreatedEphemeral(panel, url, vars = {}) {
  const title = applyVars(panel.successTitle, vars);
  const message = applyVars(panel.successMessage, vars);

  const container = new ContainerBuilder().addTextDisplayComponents(
    text(`### ${title}`),
    text(`-# ${message}`)
  );
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

// Efêmera quando o usuário atingiu o limite de tickets abertos
function buildLimitReached(records, guildId, max) {
  const links = records
    .slice(0, 5)
    .map((r) => `• <#${r.threadId}>`)
    .join("\n");

  return [
    new ContainerBuilder()
      .setAccentColor(0xe50000)
      .addTextDisplayComponents(
        text("### Você já tem um ticket aberto."),
        text(`-# Limite neste painel: ${max} ticket(s) por pessoa. Finalize o atual antes de abrir outro.`),
        text(links)
      ),
  ];
}

// Pergunta de confirmação antes de finalizar
function buildCloseConfirm(panelId, optionKey) {
  return [
    new ContainerBuilder()
      .setAccentColor(0xe50000)
      .addTextDisplayComponents(
        text("### Finalizar este ticket?"),
        text("-# O tópico será excluído e a conversa não poderá ser recuperada.")
      )
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`ticket_closeok:${panelId}:${optionKey}`)
            .setLabel("Confirmar")
            .setStyle(ButtonStyle.Danger)
        )
      ),
  ];
}

module.exports = {
  buildTicketPanel,
  buildTicketContainer,
  buildClaimedContainer,
  buildTicketCreatedEphemeral,
  buildLimitReached,
  buildCloseConfirm,
};
