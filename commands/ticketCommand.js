const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");
const { sendTicketPanel } = require("../utils/ticketPanels");

module.exports = {
  name: "ticket",
  async execute(message) {
    // Apenas os cargos da equipe podem usar o comando
    if (!message.member.roles.cache.hasAny(...ALL_STAFF_ROLE_IDS)) {
      const warning = await message.channel
        .send("Você não tem permissão para usar esse comando.")
        .catch(() => null);

      // Apaga o aviso (e o comando do usuário) após 5 segundos
      setTimeout(() => {
        warning?.delete().catch(() => {});
        message.delete().catch(() => {});
      }, 5000);
      return;
    }

    message.delete().catch(() => {});

    // Envia o painel com a configuração atual (textos, imagens e opções do menu de tickets)
    await sendTicketPanel(message.channel);
  },
};
