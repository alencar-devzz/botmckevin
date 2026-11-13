const { MessageFlags } = require("discord.js");
const { handleButton } = require("../handlers/buttonHandlers");
const { handleSelect } = require("../handlers/selectHandlers");
const { handleModal } = require("../handlers/modalHandlers");
const { touchMenu } = require("../utils/menuSession");
const { runProtected, opensModal } = require("../utils/safeInteraction");

module.exports = {
  name: "interactionCreate",
  async execute(interaction) {
    try {
      // Slash commands (ex.: /ban, /kick, /mute). Cada comando exporta "executeSlash".
      if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command?.executeSlash) return;
        return await command.executeSlash(interaction);
      }

      // Renova o prazo de expiração do menu principal
      if (
        (interaction.isMessageComponent() || interaction.isModalSubmit()) &&
        !interaction.customId?.startsWith("help:") // o /help não renova o prazo do n!menu
      ) {
        touchMenu(interaction);
      }

      // Os botões respondem como os do painel groles: o bot confirma sozinho logo no clique
      // (ganhando até 15 minutos) e, se algo falhar, a pessoa recebe um aviso.
      // Exceção: botões que abrem modal respondem direto, sem essa proteção.
      if (interaction.isButton()) {
        if (opensModal(interaction.customId)) return await handleButton(interaction);
        return await runProtected(interaction, handleButton);
      }

      if (
        interaction.isStringSelectMenu() ||
        interaction.isChannelSelectMenu() ||
        interaction.isRoleSelectMenu() ||
        interaction.isUserSelectMenu() // select de pessoas do painel groles
      ) {
        return await handleSelect(interaction);
      }

      if (interaction.isModalSubmit()) {
        return await handleModal(interaction);
      }
    } catch (err) {
      console.error("[INTERACTION] Erro:", err);
      const payload = {
        content: "Ocorreu um erro ao processar essa ação.",
        flags: MessageFlags.Ephemeral,
      };
      if (interaction.replied || interaction.deferred) {
        interaction.followUp(payload).catch(() => {});
      } else {
        interaction.reply(payload).catch(() => {});
      }
    }
  },
};
