const { MessageFlags, SlashCommandBuilder, InteractionContextType } = require("discord.js");
const { buildMainMenu } = require("../ui/mainMenu");
const { startMenuSession } = require("../utils/menuSession");
const { getPrefix } = require("../utils/getPrefix");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");

// /menu: painel de configurações do bot. Resposta efêmera (só quem usou vê).
// Só quem tem um dos cargos de utils/staffRoles.js pode abrir o menu.
module.exports = {
  name: "menu",
  category: "Configuração",
  staffOnly: true,

  data: new SlashCommandBuilder()
    .setName("menu")
    .setDescription("Abre o menu de configurações do bot.")
    .setContexts(InteractionContextType.Guild),

  async executeSlash(interaction) {
    if (!interaction.member?.roles?.cache?.hasAny(...ALL_STAFF_ROLE_IDS)) {
      return interaction.reply({
        content: "Você não tem permissão para usar este comando.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Confirma logo (o banco pode demorar) e envia o painel em seguida
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const prefix = await getPrefix(interaction.guild.id);
    const sent = await interaction.editReply({
      components: buildMainMenu({ guild: interaction.guild, client: interaction.client, prefix }),
      flags: MessageFlags.IsComponentsV2,
    });

    // Expira após 5 minutos sem interação
    startMenuSession(interaction, sent);
  },
};
