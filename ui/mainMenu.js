const {
  ContainerBuilder,
  TextDisplayBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
} = require("discord.js");

// Lista única de sistemas: alimenta o texto do topo e as opções do select.
// Para adicionar um sistema novo, basta incluir aqui (e tratar o value em handlers/selectHandlers.js).
const SISTEMAS = [
  {
    label: "Aparência e prefixo",
    description: "Avatar, banner, prefixo, nome e status do bot.",
    value: "aparencia",
  },
  {
    label: "Comunidade e interação",
    description: "Configurações da comunidade e interações.",
    value: "comunidade",
  },
  {
    label: "Moderação",
    description: "Sistema de tickets e outras ferramentas de moderação.",
    value: "moderacao",
  },
];

function buildMainMenu() {
  const header = new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent("## Menu de configurações"),
    new TextDisplayBuilder().setContent(
      `-# Sistemas disponíveis: ${SISTEMAS.map((s) => s.label).join(" · ")}`
    )
  );

  const selectContainer = new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent("### Selecione abaixo"),
    new TextDisplayBuilder().setContent("-# Selecione o que deseja configurar.")
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId("main_menu")
    .setPlaceholder("Selecione uma opção")
    .addOptions(SISTEMAS);

  selectContainer.addActionRowComponents(new ActionRowBuilder().addComponents(select));

  return [header, selectContainer];
}

module.exports = { buildMainMenu, SISTEMAS };
