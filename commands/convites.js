const { MessageFlags, SlashCommandBuilder, InteractionContextType } = require("discord.js");
const { getStats } = require("../utils/invites/store");
const { isTracking } = require("../utils/invites/tracker");
const { buildInvitesPanel, buildNotice } = require("../ui/convites");

// /convites [pessoa]: mostra quantos convites a pessoa criou e quantos entraram, saíram e são contas recentes.
// Sem escolher ninguém, mostra os convites de quem usou o comando. A resposta é efêmera (só quem usou vê).
module.exports = {
  name: "convites",
  category: "Utilidades",

  data: new SlashCommandBuilder()
    .setName("convites")
    .setDescription("Mostra os convites de uma pessoa: criados, entradas, saídas e contas recentes.")
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) =>
      o.setName("usuário").setDescription("De quem ver os convites (deixe vazio para ver os seus).")
    ),

  async executeSlash(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const user = interaction.options.getUser("usuário") ?? interaction.user;
      const member = interaction.options.getMember("usuário") ?? (user.id === interaction.user.id ? interaction.member : null);
      const stats = await getStats(interaction.guildId, user.id);

      await interaction.editReply({
        components: buildInvitesPanel({
          stats,
          name: user.username,
          avatarUrl: (member ?? user).displayAvatarURL({ extension: "png", size: 256 }),
          tracking: isTracking(interaction.guildId),
        }),
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
      });
    } catch (err) {
      console.error("[CONVITES] Erro no comando:", err);
      await interaction
        .editReply({
          components: buildNotice("Não consegui carregar os convites agora. Tente de novo em instantes."),
          flags: MessageFlags.IsComponentsV2,
        })
        .catch(() => {});
    }
  },
};
