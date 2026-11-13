const { MessageFlags, SlashCommandBuilder, InteractionContextType } = require("discord.js");
const { collectMetrics } = require("../utils/metrics");
const { buildMetricsPanel, buildNotice } = require("../ui/metricas");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");

// /metricas: painel com a saúde do bot, memória (RAM), processo, Discord e banco de dados.
// Só quem tem um dos cargos de utils/staffRoles.js pode usar (igual ao painelps).
module.exports = {
  name: "metricas",
  category: "Utilidades",
  staffOnly: true,

  data: new SlashCommandBuilder()
    .setName("metricas")
    .setDescription("Mostra a saúde, a memória, o processo e o banco de dados do bot.")
    .setContexts(InteractionContextType.Guild),

  async executeSlash(interaction) {
    if (!interaction.member?.roles?.cache?.hasAny(...ALL_STAFF_ROLE_IDS)) {
      return interaction.reply({
        components: buildNotice("Você não tem permissão para usar este comando."),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    // Resposta efêmera: só quem usou o comando vê o painel.
    // O banco pode demorar um pouco na primeira vez: confirma logo e envia o painel em seguida
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const data = await collectMetrics(interaction.client, interaction.guild);
    await interaction.editReply({
      components: buildMetricsPanel(data),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
  },
};
