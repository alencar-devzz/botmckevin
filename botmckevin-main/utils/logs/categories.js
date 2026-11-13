// Categorias de logs disponíveis. Para criar uma nova, adicione aqui e emita o log em utils/logs/*.js
const LOG_CATEGORIES = {
  mensagens: {
    label: "Mensagens",
    option: "Logs de mensagens",
    description: "Mensagens apagadas e editadas.",
    slug: "mensagens",
    botsHint: "Ignora mensagens enviadas por bots.",
    events: [
      "Mensagens apagadas (conteúdo, autor e quem apagou)",
      "Apagamentos em massa e limpezas por comando — limpar e cl (uma embed só com total e executor)",
      "Não registra as mensagens de comando que o próprio bot apaga",
      "Mensagens editadas (texto antes e depois, com atalho para abrir)",
    ],
  },
  entradas: {
    label: "Entradas e saídas",
    option: "Entradas e saídas do servidor",
    description: "Quem entrou e quem saiu do servidor.",
    slug: "entradas-saidas",
    botsHint: "Ignora bots entrando ou saindo.",
    events: [
      "Entrada de membros (idade da conta e total de membros)",
      "Saída de membros (tempo no servidor e cargos que possuía)",
    ],
  },
  banimentos: {
    label: "Banimentos",
    option: "Logs de banimentos",
    description: "Banimentos e desbanimentos.",
    slug: "banimentos",
    botsHint: "Ignora banimentos de contas de bots.",
    events: ["Banimentos (executor e motivo)", "Desbanimentos (executor e motivo)"],
  },
  castigos: {
    label: "Castigos",
    option: "Logs de castigos",
    description: "Castigos (timeout) aplicados e removidos.",
    slug: "castigos",
    botsHint: "Ignora castigos em contas de bots.",
    events: ["Castigos aplicados (duração, executor e motivo)", "Castigos removidos"],
  },
  expulsoes: {
    label: "Expulsões",
    option: "Logs de expulsões",
    description: "Membros expulsos do servidor.",
    slug: "expulsoes",
    botsHint: "Ignora expulsões de contas de bots.",
    events: ["Expulsões (executor e motivo)"],
  },
  calls: {
    label: "Calls de voz",
    option: "Logs de calls (entrada e saída)",
    description: "Entrada, saída e troca de calls.",
    slug: "calls",
    botsHint: "Ignora bots nas calls.",
    events: [
      "Entrada em call (com quem já estava na call)",
      "Saída de call (com quem restou)",
      "Troca de call",
      "Várias entradas/saídas/trocas seguidas viram uma embed única",
    ],
  },
  canais: {
    label: "Canais",
    option: "Logs de canais",
    description: "Canais criados, editados e excluídos.",
    slug: "canais",
    botsHint: "Ignora ações feitas por bots.",
    events: [
      "Canais criados",
      "Canais editados (nome, tópico, categoria, modo lento, permissões)",
      "Canais excluídos",
      "Ações em massa (vários canais de uma vez) saem numa embed única",
    ],
  },
  cargos: {
    label: "Cargos",
    option: "Logs de cargos",
    description: "Cargos criados, editados, excluídos e dados a membros.",
    slug: "cargos",
    botsHint: "Ignora ações feitas por bots.",
    events: [
      "Cargos criados e excluídos",
      "Cargos editados (nome, cor, permissões)",
      "Cargos adicionados ou removidos de membros (juntos numa embed)",
      "Cargos dados ou removidos pelo painel n!groles (uma embed por pessoa, juntando tudo o que o staff fez)",
      "Ações em massa (vários cargos de uma vez) saem numa embed única",
    ],
  },
};

const LOG_KEYS = Object.keys(LOG_CATEGORIES);

module.exports = { LOG_CATEGORIES, LOG_KEYS };
