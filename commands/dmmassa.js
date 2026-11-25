const { MessageFlags, SlashCommandBuilder, InteractionContextType } = require("discord.js");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");
const { createDmMassaSession } = require("../utils/dmMassa/session");
const { buildDmMassaHome } = require("../ui/dmMassa");

// /dmmassa: painel efêmero para disparar DMs em massa usando a USER_TOKEN da conta configurada.
// So quem tem um cargo de staff pode usar.
module.exports = {
  name: "dmmassa",
  category: "Self",
  staffOnly: true,

  data: new SlashCommandBuilder()
    .setName("dmmassa")
    .setDescription("Dispara DMs em massa para membros de um servidor via token de conta.")
    .setContexts(InteractionContextType.Guild),

  async executeSlash(interaction) {
    if (!interaction.member?.roles?.cache?.hasAny(...ALL_STAFF_ROLE_IDS)) {
      return interaction.reply({
        components: [
          {
            type: 17, // Container
            components: [{ type: 10, content: "Voce nao tem permissao para usar este comando." }],
          },
        ],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    const session = createDmMassaSession(interaction.user.id);

    return interaction.reply({
      components: buildDmMassaHome(session),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  },
};
