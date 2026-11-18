const { buildCategoryPanel } = require("./categoryPanel");

// Fonte única: alimenta a lista do painel e a busca do menu (utils/menuSearch.js)
const OPCOES = [
  { label: "Portaria", description: "Boas-vindas, saídas, DM de entrada e filtro de contas.", value: "portaria" },
  { label: "Auto-roles", description: "Configure os cargos automáticos.", value: "autoroles" },
  { label: "Posts e Instagram", description: "Fotos e vídeos com curtidas e comentários.", value: "posts" },
  {
    label: "Calls temporárias",
    description: "Call própria para quem entra no gatilho e painel de gerenciamento.",
    value: "calls",
  },
  {
    label: "Comando cl",
    description: "Apaga as mensagens de quem digita cl. Quem usa, canais e limites.",
    value: "cl",
  },
  {
    label: "Comando spotify",
    description: "Card da música do Spotify. Uso, aparência, botões, letra e comportamento.",
    value: "spotify",
  },
  {
    label: "Convites",
    description: "Recompensas por convite, detecção de fake e canal de conquistas.",
    value: "convites",
  },
  {
    label: "Sorteios",
    description: "Crie, publique e acompanhe sorteios do servidor.",
    value: "sorteios",
  },
];

function buildComunidadePanel(page = 0) {
  return buildCategoryPanel({
    group: "comunidade",
    title: "### <:member2:1572386159882014762> Comunidade e interação",
    description: "Configurações da comunidade e interações.",
    options: OPCOES,
    page,
  });
}

module.exports = { buildComunidadePanel, COMUNIDADE_OPCOES: OPCOES };
