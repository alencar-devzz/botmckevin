const { MessageFlags, SlashCommandBuilder, InteractionContextType } = require("discord.js");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");
const { listSorteios } = require("../utils/sorteio/store");
const { listView, noticeView } = require("../ui/sorteio");

// /sorteio: central de sorteios. Painel efêmero em Components V2 (só quem usou o comando vê).
// Só quem tem um dos cargos de utils/staffRoles.js pode usar. Os botões ficam em handlers/sorteioHandlers.js.
module.exports = {
  name: "sorteio",
  category: "Comunidade",
  staffOnly: true,

  data: new SlashCommandBuilder()
    .setName("sorteio")
    .setDescription("Cria, publica e acompanha sorteios por um painel.")
    .setContexts(InteractionContextType.Guild),

  async executeSlash(interaction) {
    if (!interaction.member?.roles?.cache?.hasAny(...ALL_STAFF_ROLE_IDS)) {
      return interaction.reply({
        components: noticeView("Sem permissão", "Só a equipe pode usar este comando.", 0xed4245),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const list = await listSorteios(interaction.guild.id);
    await interaction.editReply({
      components: listView(interaction.guild, list),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
  },
};
