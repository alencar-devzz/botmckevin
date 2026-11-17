const {
  ContainerBuilder,
  TextDisplayBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
} = require("discord.js");
const { addBackButton } = require("./backButton");

// Fonte única: alimenta o select abaixo e a busca do menu (utils/menuSearch.js)
const OPCOES = [
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
  },
  {
    label: "Comando nnuke",
    description: "Recria o canal do zero. Mensagem, cores, quem usa e canais.",
    value: "nuke",
  },
  {
    label: "Bump reminder",
    description: "Lembrete de bump, agradecimento, cargos, tempos e embeds.",
    value: "bump",
  }
];

function buildModeracaoPanel() {
  const header = new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent("### <:Shield:1572386860485976136> Moderação"),
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
      ...OPCOES
    );

  selectContainer.addActionRowComponents(new ActionRowBuilder().addComponents(select));
  addBackButton(selectContainer, "back_main");

  return [header, selectContainer];
}

module.exports = { buildModeracaoPanel, MODERACAO_OPCOES: OPCOES };
