// Configurações fixas do sistema de tickets

// Cargos da equipe do ticket: são marcados no ticket e podem assumir/finalizar
const STAFF_ROLE_IDS = [
  "1542321888355684456",
  "1542321888309809212",
  "1542321888309809210",
  "1565539317173059785",
];

const PANEL_IMAGE =
  "https://i.supaimg.com/8a98f5c3-92c7-4d3b-b8d7-26b52fc28184/8a71d00e-a3c3-43c7-9308-ff4cf0cd7bc3.jpg";

// Opções do select menu (sem emojis)
const TICKET_OPTIONS = {
  suporte: {
    label: "Suporte",
    description: "Tire dúvidas ou peça ajuda da equipe",
    title: "SUPORTE",
  },
  denunciar: {
    label: "Denunciar",
    description: "Denuncie um membro ou situação",
    title: "DENUNCIAR",
  },
  parceria: {
    label: "Parceria",
    description: "Proponha uma parceria com o servidor",
    title: "PARCERIA",
  },
};

module.exports = { STAFF_ROLE_IDS, PANEL_IMAGE, TICKET_OPTIONS };
