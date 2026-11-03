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
    warning?.delete().catch(() => {});
    message.delete().catch(() => {});
  }, 8000);
}

module.exports = {
  name: "ticket",
  // Uso: n!ticket [nome do painel]
  async execute(message, args = []) {
    // Apenas os cargos da equipe podem usar o comando
    if (!message.member.roles.cache.hasAny(...ALL_STAFF_ROLE_IDS)) {
      return reply(message, "Você não tem permissão para usar esse comando.");
    }

    const panels = await listPanels(message.guild.id);
    if (!panels.length) {
      return reply(
        message,
        "Nenhum painel de tickets foi criado ainda. Crie um em Menu > Moderação > Sistema de tickets."
      );
    }

    const query = normalize(args.join(" "));
    let panel = null;

    if (query) {
      panel =
        panels.find((p) => normalize(p.name) === query) ??
        panels.find((p) => normalize(p.name).includes(query));
      if (!panel) {
        return reply(
          message,
          `Não encontrei um painel chamado "${args.join(" ")}". Painéis: ${panels.map((p) => `\`${p.name}\``).join(", ")}`
        );
      }
    } else if (panels.length === 1) {
      panel = panels[0];
    } else {
      return reply(
        message,
        `Há ${panels.length} painéis. Informe o nome: \`ticket nome do painel\`. Painéis: ${panels.map((p) => `\`${p.name}\``).join(", ")}`
      );
    }

    message.delete().catch(() => {});
    await sendTicketPanel(message.channel, panel);
  },
};
