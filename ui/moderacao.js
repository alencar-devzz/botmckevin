const {
  ContainerBuilder,
  TextDisplayBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
} = require("discord.js");
const { addBackButton } = require("./backButton");

function buildModeracaoPanel() {
  const header = new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent("### Moderação"),
    new TextDisplayBuilder().setContent("-# Configurações de moderação e atendimento do servidor.")
  );

  const selectContainer = new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent("**Selecione abaixo**"),
    new TextDisplayBuilder().setContent("-# Configurações de moderação.")
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId("moderacao_menu")
    .setPlaceholder("Selecione uma opção")
    .addOptions(
      {
        label: "Sistema de tickets",
        description: "Painel, textos, imagens, cargos e opções dos tickets.",
        value: "tickets",
      },
      {
        label: "Logs e registros",
        description: "Mensagens, banimentos, calls, canais, cargos e mais.",
        value: "logs",
      },
      {
        label: "Gerenciamento de cargos",
        description: "Quem gerencia quais cargos e a aparência do painel do groles.",
        value: "cargos",
      }
    );

  selectContainer.addActionRowComponents(new ActionRowBuilder().addComponents(select));
  addBackButton(selectContainer, "back_main");

  return [header, selectContainer];
}

module.exports = { buildModeracaoPanel };
