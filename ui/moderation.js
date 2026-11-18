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

// Painel de confirmação (sem cor de destaque).
// userId/avatarUrl: usuário alvo (menção + foto no canto) | executorId: staff que usou o comando.
// expires: false remove o aviso "expira em 1 minuto" (usado pelos slash commands).
function buildConfirmPanel({
  title,
  question,
  reason,
  userId = null,
  executorId = null,
  avatarUrl = null,
  expires = true,
}) {
  const container = new ContainerBuilder();
  const display = (content) => new TextDisplayBuilder().setContent(content);

  // Título e pergunta
  container.addTextDisplayComponents(display(`## ${title}`), display(`-# ${question}`));
  container.addSeparatorComponents(new SeparatorBuilder());

  // Usuário (menção que não pinga, por causa do allowedMentions) + ID, com a foto no canto
  if (userId) {
    addTexts(container, [`**Usuário**\n<@${userId}>\n-# **ID:** ${userId}`], avatarUrl);
  }

  // Motivo em citação
  const motivo = String(reason ?? "").trim() || "Não inserido";
  const quoted = motivo
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  container.addTextDisplayComponents(display(`**Motivo**\n${quoted}`));

  // Executor + horário atual no formato nativo do Discord
  if (executorId) {
    const now = Math.floor(Date.now() / 1000);
    container.addTextDisplayComponents(display(`**Executor**\n<@${executorId}> · <t:${now}:f>`));
  }

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
    container.addTextDisplayComponents(display("-# Esta confirmação expira em 1 minuto."));
  }

  return [container];
}

const DONE_TITLES = {
  ban: "Banimento concluído",
  unban: "Unban concluído",
  kick: "Expulsão concluída",
  mute: "Mute concluído",
  unmute: "Unmute concluído",
};

// Painel mostrado só depois que a ação foi concluída (sem cor, sem botões).
// executorId: staff que confirmou | extra: linha opcional (ex.: duração do mute)
function buildDonePanel({ action, userId, executorId, reason, avatarUrl = null, extra = null }) {
  const container = new ContainerBuilder();
  const display = (content) => new TextDisplayBuilder().setContent(content);

  container.addTextDisplayComponents(
    display(`## ${DONE_TITLES[action] ?? "Ação concluída"}`),
    display(extra ? `Ação realizada com sucesso\n-# ${extra}` : "Ação realizada com sucesso")
  );
  container.addSeparatorComponents(new SeparatorBuilder());

  addTexts(container, [`**Usuário**\n<@${userId}>\n-# **ID:** ${userId}`], avatarUrl);

  const motivo = String(reason ?? "").trim() || "Não inserido";
  const quoted = motivo
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  container.addTextDisplayComponents(display(`**Motivo**\n${quoted}`));

  const now = Math.floor(Date.now() / 1000);
  container.addTextDisplayComponents(display(`**Executor**\n<@${executorId}> · <t:${now}:f>`));

  return [container];
}

// avatarUrl: foto do usuário alvo (opcional).
function buildResultPanel(text, avatarUrl = null) {
  const container = new ContainerBuilder();
  addTexts(container, [text], avatarUrl);
  return [container];
}

module.exports = { buildConfirmPanel, buildDonePanel, buildResultPanel };
