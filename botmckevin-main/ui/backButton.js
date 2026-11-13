const {
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  SeparatorBuilder,
} = require("discord.js");

function buildBackButton(customId) {
  const button = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel("Voltar")
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder().addComponents(button);
}

// Adiciona o botão "Voltar" DENTRO do container (com um separador acima).
// Chame depois de adicionar os demais componentes do container.
function addBackButton(container, customId) {
  container.addSeparatorComponents(new SeparatorBuilder());
  container.addActionRowComponents(buildBackButton(customId));
  return container;
}

module.exports = { buildBackButton, addBackButton };
