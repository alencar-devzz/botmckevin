const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require("discord.js");

function buildConfirmPanel({ title, question, reason }) {
  const container = new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`### ${title}`),
    new TextDisplayBuilder().setContent(question),
    new TextDisplayBuilder().setContent(`Motivo: \`${reason ?? "Não inserido"}\``)
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

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent("-# Esta confirmação expira em 1 minuto.")
  );

  return [container];
}

function buildResultPanel(text) {
  const container = new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(text)
  );
  return [container];
}

module.exports = { buildConfirmPanel, buildResultPanel };
