const { MessageFlags, SlashCommandBuilder, InteractionContextType } = require("discord.js");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");
const { createSession } = require("../utils/catClone/session");
const { buildHome, buildNotice } = require("../ui/dupCategoria");

// /duplicar-categoria: painel interativo (só você vê) para copiar uma categoria com os canais, todas as
// permissões e as configurações. Só quem tem um dos cargos de utils/staffRoles.js pode usar.
module.exports = {
  name: "duplicar-categoria",
  category: "Utilidades",
  staffOnly: true,

  data: new SlashCommandBuilder()
    .setName("duplicar-categoria")
    .setDescription("Duplica uma categoria com os canais, as permissões e as configurações.")
    .setContexts(InteractionContextType.Guild),

  async executeSlash(interaction) {
    if (!interaction.member?.roles?.cache?.hasAny(...ALL_STAFF_ROLE_IDS)) {
      return interaction.reply({
        components: buildNotice("Você não tem permissão para usar este comando."),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    const state = createSession(interaction.user.id, interaction.guildId);
    return interaction.reply({
      components: buildHome(state, interaction.guild),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  },
};
