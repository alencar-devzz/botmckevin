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

function buildGallery(urls) {
  return new MediaGalleryBuilder().addItems(
    urls.slice(0, 10).map((url) => new MediaGalleryItemBuilder().setURL(url))
  );
}

// Painel enviado pelo n!ticket (ou pelo menu): imagens + texto + select menu
// media = { panel: { items }, internal: { items } } (de utils/ticketMedia). Sem media, usa só links.
function buildTicketPanel(settings, media = null) {
  const select = new StringSelectMenuBuilder()
    .setCustomId("ticket_select")
    .setPlaceholder(settings.panelPlaceholder.slice(0, 150))
    .addOptions(
      settings.options.slice(0, 25).map((opt) => {
        const item = { label: opt.label.slice(0, 100), value: opt.key };
        if (opt.description) item.description = opt.description.slice(0, 100);
        return item;
      })
    );

  const container = new ContainerBuilder();

  const panelItems = media?.panel.items ?? settings.panelImages.filter((u) => /^https?:/i.test(u));
  if (panelItems.length) {
    container.addMediaGalleryComponents(buildGallery(panelItems));
  }

  const textParts = [];
  if (settings.panelTitle) textParts.push(`### ${settings.panelTitle}`);
  if (settings.panelDescription) textParts.push(settings.panelDescription);
  if (textParts.length) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(textParts.join("\n")));
  }

  container.addActionRowComponents(new ActionRowBuilder().addComponents(select));
  return [container];
}

// Container dentro do tópico do ticket
function buildTicketContainer({
  author,
  optionKey,
  claimedBy = null,
  settings,
  guildName = "",
  media = null,
}) {
  const opt = getOption(settings, optionKey);
  const vars = {
    user: `<@${author.id}>`,
    username: author.username,
    option: opt.label,
    server: guildName,
  };

  const heading = applyVars(settings.internalHeading, vars);
  const message = applyVars(opt.message || settings.internalMessage, vars);

  const section = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${heading}`),
      new TextDisplayBuilder().setContent(
        `**Assumido por:** \`${claimedBy ? claimedBy.username : "Ninguém"}\``
      ),
      new TextDisplayBuilder().setContent(`**Opção selecionada:**\n\`\`\`\n${opt.label}\n\`\`\``)
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder().setURL(author.displayAvatarURL({ extension: "png", size: 256 }))
    );

  const claimButton = new ButtonBuilder()
    .setCustomId(`ticket_claim:${author.id}:${optionKey}`)
    .setLabel(claimedBy ? "Assumido" : "Assumir")
    .setStyle(claimedBy ? ButtonStyle.Secondary : ButtonStyle.Success)
    .setDisabled(Boolean(claimedBy));

  const closeButton = new ButtonBuilder()
    .setCustomId("ticket_close")
    .setLabel("Finalizar")
    .setStyle(ButtonStyle.Danger);

  const container = new ContainerBuilder()
    .addSectionComponents(section)
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${opt.title}\n ${message}`)
    );

  const internalItems =
    media?.internal.items ?? settings.internalImages.filter((u) => /^https?:/i.test(u));
  if (internalItems.length) {
    container.addMediaGalleryComponents(buildGallery(internalItems));
  }

  return container.addActionRowComponents(
    new ActionRowBuilder().addComponents(claimButton, closeButton)
  );
}

// Mensagem enviada quando um staff assume o ticket
function buildClaimedContainer({ staffId, authorId, timestamp, settings, guildName = "" }) {
  const text = applyVars(settings.claimedMessage, {
    staff: `<@${staffId}>`,
    user: `<@${authorId}>`,
    server: guildName,
  });

  return new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`### ${text}\n-# <t:${timestamp}:t>`)
  );
}

// Efêmera de sucesso com botão para o ticket
function buildTicketCreatedEphemeral(url) {
  const link = new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel("Ir para o ticket")
    .setURL(url);

  return [
    new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent("### Atendimento indicado com sucesso.")
      )
      .addActionRowComponents(new ActionRowBuilder().addComponents(link)),
  ];
}

module.exports = {
  buildTicketPanel,
  buildTicketContainer,
  buildClaimedContainer,
  buildTicketCreatedEphemeral,
};
