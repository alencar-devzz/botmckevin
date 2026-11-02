const {
  ContainerBuilder,
  TextDisplayBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
} = require("discord.js");

function buildMainMenu() {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("### Menu de configurações do bot"),
      new TextDisplayBuilder().setContent("-# Selecione abaixo o que você deseja configurar")
    );

  const select = new StringSelectMenuBuilder()
    .setCustomId("main_menu")
    .setPlaceholder("Selecione uma opção")
    .addOptions(
      {
        label: "Aparência e prefixo",
        description: "Configurações de aparência do bot.",
        value: "aparencia",
      },
      {
        label: "Comunidade e interação",
        description: "Configurações da comunidade e interações.",
        value: "comunidade",
      },
      {
        label: "Sistema de tickets",
        description: "Painel, textos, imagens, cargos e opções dos tickets.",
        value: "tickets",
      }
    );

  const row = new ActionRowBuilder().addComponents(select);
  container.addActionRowComponents(row);

  return [container];
}

module.exports = { buildMainMenu };
