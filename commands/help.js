const { MessageFlags, SlashCommandBuilder, InteractionContextType } = require("discord.js");
const { renderHelp } = require("../handlers/helpHandlers");

// /help — central de ajuda efêmera (Components V2).
// Não precisa de manutenção: ela lê o client.commands, então qualquer comando novo
// (slash com "data" e/ou de prefixo com "execute") aparece sozinho. Veja utils/helpRegistry.js.
module.exports = {
  name: "help",
  category: "Utilidades",

  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Mostra todos os comandos do bot.")
    .setContexts(InteractionContextType.Guild),

  async executeSlash(interaction) {
    return interaction.reply({
      components: await renderHelp(interaction, { cat: "all", page: 0 }),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
  },
};
