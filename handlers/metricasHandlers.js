const { MessageFlags } = require("discord.js");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");
const { collectMetrics } = require("../utils/metrics");
const { buildMetricsPanel, buildNotice } = require("../ui/metricas");

const isStaff = (interaction) => Boolean(interaction.member?.roles?.cache?.hasAny(...ALL_STAFF_ROLE_IDS));

const deny = (interaction) =>
  interaction.reply({
    components: buildNotice("Você não tem permissão para usar este painel."),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });

// Botão Atualizar ("met:refresh:<tela>"). O botão do MongoDB é um link e não passa por aqui.
async function handleMetricsButton(interaction) {
  if (!isStaff(interaction)) return deny(interaction);

  if (interaction.customId.startsWith("met:refresh")) {
    const view = interaction.customId.split(":")[2] ?? "saude";
    const data = await collectMetrics(interaction.client, interaction.guild);
    return interaction.update({ components: buildMetricsPanel(data, view) });
  }
}

// Dropdown que troca a tela ("met:view")
async function handleMetricsSelect(interaction) {
  if (!isStaff(interaction)) return deny(interaction);

  if (interaction.customId === "met:view") {
    await interaction.deferUpdate();
    const data = await collectMetrics(interaction.client, interaction.guild);
    return interaction.editReply({ components: buildMetricsPanel(data, interaction.values[0]) });
  }
}

module.exports = { handleMetricsButton, handleMetricsSelect };
