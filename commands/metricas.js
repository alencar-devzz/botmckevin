const { MessageFlags } = require("discord.js");
const { collectMetrics } = require("../utils/metrics");
const { buildMetricsPanel } = require("../ui/metricas");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");

// n!metricas: painel com a saúde do bot, memória (RAM), processo, Discord e banco de dados.
// Só quem tem um dos cargos de utils/staffRoles.js pode usar (igual ao painelps).
module.exports = {
  name: "metricas",
  aliases: ["métricas", "metrics"],
  category: "Utilidades",
  description: "Mostra a saúde, a memória, o processo e o banco de dados do bot.",
  usage: "metricas",
  staffOnly: true,

  async execute(message) {
    const { member, channel } = message;

    if (!member.roles.cache.hasAny(...ALL_STAFF_ROLE_IDS)) {
      const sent = await channel
        .send({ content: `${message.author}, você não tem permissão para usar este comando.`, allowedMentions: { parse: [] } })
        .catch(() => null);
      setTimeout(() => sent?.delete().catch(() => {}), 8000);
      return;
    }

    const data = await collectMetrics(message.client, message.guild);
    await channel.send({
      components: buildMetricsPanel(data),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
  },
};
