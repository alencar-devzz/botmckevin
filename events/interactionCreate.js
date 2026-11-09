const { MessageFlags } = require("discord.js");
const { handleButton } = require("../handlers/buttonHandlers");
const { handleSelect } = require("../handlers/selectHandlers");
const { handleModal } = require("../handlers/modalHandlers");
const { touchMenu } = require("../utils/menuSession");

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
      if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
        touchMenu(interaction);
      }

      if (interaction.isButton()) {
        return await handleButton(interaction);
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
