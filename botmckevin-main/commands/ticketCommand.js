const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");
const { listPanels } = require("../utils/ticketPanelStore");
const { sendTicketPanel } = require("../utils/ticketPanels");

const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

// Resposta temporária (some junto com o comando do usuário)
async function reply(message, content) {
  const warning = await message.channel.send(content).catch(() => null);
  setTimeout(() => {
    if (warning) warning.delete().catch(() => {});
    message.delete().catch(() => {});
  }, 8000);
}

module.exports = {
  name: "ticket",
  // Uso: n!ticket [nome do painel]
  async execute(message, args = []) {
    if (!message.guild || !message.member) return;

    // Apenas os cargos da equipe podem usar o comando
    const staffIds = Array.isArray(ALL_STAFF_ROLE_IDS) ? ALL_STAFF_ROLE_IDS : [];
    const isStaff = staffIds.some((id) => message.member.roles.cache.has(id));
    if (!isStaff) {
      return reply(message, "Você não tem permissão para usar esse comando.");
    }

    try {
      const panels = await listPanels(message.guild.id);
      if (!Array.isArray(panels) || panels.length === 0) {
        return reply(
          message,
          "Nenhum painel de tickets foi criado ainda. Crie um em Menu > Moderação > Sistema de tickets."
        );
      }

      const typed = args.join(" ");
      const query = normalize(typed);
      const names = panels.map((p) => "`" + p.name + "`").join(", ");
      let panel = null;

      if (query) {
        panel =
          panels.find((p) => normalize(p.name) === query) ??
          panels.find((p) => normalize(p.name).includes(query));
        if (!panel) {
          return reply(
            message,
            "Não encontrei um painel chamado \"" + typed + "\". Painéis: " + names
          );
        }
      } else if (panels.length === 1) {
        panel = panels[0];
      } else {
        return reply(
          message,
          "Há " + panels.length + " painéis. Informe o nome: `n!ticket nome do painel`. Painéis: " + names
        );
      }

      message.delete().catch(() => {});
      await sendTicketPanel(message.channel, panel);
    } catch (err) {
      console.error("[ticket] Erro ao enviar painel:", err);
      return reply(message, "Ocorreu um erro ao enviar o painel de tickets.");
    }
  },
};