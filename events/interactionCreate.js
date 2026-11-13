const { MessageFlags } = require("discord.js");
const { handleButton } = require("../handlers/buttonHandlers");
const { handleSelect } = require("../handlers/selectHandlers");
const { handleModal } = require("../handlers/modalHandlers");
const { touchMenu } = require("../utils/menuSession");
const { runProtected, opensModal } = require("../utils/safeInteraction");

module.exports = {
  name: "interactionCreate",
  async execute(interaction) {
    // Autocomplete (ex.: lista de banidos do /unban). Cada comando pode exportar "autocomplete".
    if (interaction.isAutocomplete()) {
      try {
        await interaction.client.commands.get(interaction.commandName)?.autocomplete?.(interaction);
      } catch (err) {
        console.error("[AUTOCOMPLETE] Erro:", err.message);
        interaction.respond([]).catch(() => {});
      }
      return;
    }

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

      // Os botões confirmam logo no clique (igual ao painel groles) e avisam se algo falhar.
      // Botões que abrem modal ficam de fora. Para desligar tudo sem mexer no código:
      // defina BOTAO_PROTECAO=off nas variáveis de ambiente da Render.
      if (interaction.isButton()) {
        if (process.env.BOTAO_PROTECAO === "off" || opensModal(interaction.customId)) {
          return await handleButton(interaction);
        }
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
