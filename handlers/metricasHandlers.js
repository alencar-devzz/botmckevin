const { MessageFlags } = require("discord.js");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");
const { collectMetrics } = require("../utils/metrics");
const { buildMetricsPanel, buildNotice } = require("../ui/metricas");

// Botões do painel do comando metricas ("met:..."). O botão do MongoDB é um link e não passa por aqui.
async function handleMetricsButton(interaction) {
  if (!interaction.member?.roles?.cache?.hasAny(...ALL_STAFF_ROLE_IDS)) {
    return interaction.reply({
      components: buildNotice("Você não tem permissão para usar este painel."),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  if (interaction.customId === "met:refresh") {
    const data = await collectMetrics(interaction.client, interaction.guild);
    return interaction.update({ components: buildMetricsPanel(data) });
  }
}

module.exports = { handleMetricsButton };
