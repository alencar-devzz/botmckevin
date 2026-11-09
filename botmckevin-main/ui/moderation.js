const {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require("discord.js");

// Adiciona os textos ao painel. Com avatarUrl, os textos ficam numa Section
// com a foto do usuário no canto (ThumbnailBuilder); sem avatarUrl, textos normais.
function addTexts(container, texts, avatarUrl) {
  const displays = texts.map((t) => new TextDisplayBuilder().setContent(t));

  if (!avatarUrl) {
    container.addTextDisplayComponents(...displays);
    return;
  }

  const section = new SectionBuilder()
    .addTextDisplayComponents(...displays)
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl));
  container.addSectionComponents(section);
}

// avatarUrl: foto do usuário alvo (opcional).
// expires: false remove o aviso "expira em 1 minuto" (usado pelos slash commands).
function buildConfirmPanel({ title, question, reason, avatarUrl = null, expires = true }) {
  const container = new ContainerBuilder();

  addTexts(
    container,
    [`### ${title}`, question, `Motivo: \`${reason ?? "Não inserido"}\``],
    avatarUrl
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  const confirmBtn = new ButtonBuilder()
    .setCustomId("mod_confirm")
    .setLabel("Confirmar")
    .setStyle(ButtonStyle.Success);

  const cancelBtn = new ButtonBuilder()
    .setCustomId("mod_cancel")
    .setLabel("Cancelar")
    .setStyle(ButtonStyle.Danger);

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(confirmBtn, cancelBtn)
  );

  if (expires) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("-# Esta confirmação expira em 1 minuto.")
    );
  }

  return [container];
}

// avatarUrl: foto do usuário alvo (opcional).
function buildResultPanel(text, avatarUrl = null) {
  const container = new ContainerBuilder();
  addTexts(container, [text], avatarUrl);
  return [container];
}

module.exports = { buildConfirmPanel, buildResultPanel };
