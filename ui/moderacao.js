const { buildCategoryPanel } = require("./categoryPanel");

// Fonte única: alimenta a lista do painel e a busca do menu (utils/menuSearch.js)
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
  },
];

function buildModeracaoPanel(page = 0) {
  return buildCategoryPanel({
    group: "moderacao",
    title: "### <:Shield:1572386860485976136> Moderação",
    description: "Configurações de moderação e atendimento do servidor.",
    options: OPCOES,
    page,
  });
}

module.exports = { buildModeracaoPanel, MODERACAO_OPCOES: OPCOES };
