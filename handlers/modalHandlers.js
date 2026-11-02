const { MessageFlags } = require("discord.js");
const BotConfig = require("../database/models/BotConfig");
const { getGuildConfig } = require("../database/getGuildConfig");
const { buildPortariaConfig } = require("../ui/portaria");
const { handleTicketConfigModal } = require("./ticketConfigHandlers");

async function getBotConfig() {
  let config = await BotConfig.findById("global");
  if (!config) config = await BotConfig.create({});
  return config;
}

// Pega a imagem enviada pelo componente File Upload do modal
function getImage(interaction, inputId) {
  const files = interaction.fields.getUploadedFiles(inputId);
  const file = files?.first();
  if (!file) return null;
  if (file.contentType && !file.contentType.startsWith("image/")) return null;
  return file;
}

async function handleModal(interaction) {
  const { customId } = interaction;

  if (customId.startsWith("tcfg_modal_")) {
    return handleTicketConfigModal(interaction);
  }

  switch (customId) {
    case "modal_nome": {
      const nome = interaction.fields.getTextInputValue("nome_input");
      try {
        await interaction.client.user.setUsername(nome);
        const botConfig = await getBotConfig();
        botConfig.name = nome;
        await botConfig.save();
        return interaction.reply({
          content: `Nome do bot atualizado para **${nome}**.`,
          flags: MessageFlags.Ephemeral,
        });
      } catch (err) {
        console.error("[MODAL NOME] Erro:", err);
        return interaction.reply({
          content:
            "Não foi possível alterar o nome agora (o Discord limita trocas de nome com frequência).",
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    case "modal_avatar": {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const file = getImage(interaction, "avatar_file");
      if (!file) {
        return interaction.editReply({ content: "Envie um arquivo de imagem válido (png, jpg, gif ou webp)." });
      }
      try {
        await interaction.client.user.setAvatar(file.url);
        const botConfig = await getBotConfig();
        botConfig.avatar = file.url;
        await botConfig.save();
        return interaction.editReply({ content: "Avatar do bot atualizado com sucesso." });
      } catch (err) {
        console.error("[MODAL AVATAR] Erro:", err);
        return interaction.editReply({
          content: "Não foi possível definir essa imagem como avatar (o Discord limita trocas frequentes).",
        });
      }
    }

    case "modal_banner": {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const file = getImage(interaction, "banner_file");
      if (!file) {
        return interaction.editReply({ content: "Envie um arquivo de imagem válido (png, jpg, gif ou webp)." });
      }
      try {
        await interaction.client.user.setBanner(file.url);
        const botConfig = await getBotConfig();
        botConfig.banner = file.url;
        await botConfig.save();
        return interaction.editReply({ content: "Banner do bot atualizado com sucesso." });
      } catch (err) {
        console.error("[MODAL BANNER] Erro:", err);
        return interaction.editReply({
          content: "Não foi possível definir essa imagem como banner. Tente outra imagem.",
        });
      }
    }

    case "modal_mensagens": {
      const welcome = interaction.fields.getTextInputValue("welcome_message");
      const leave = interaction.fields.getTextInputValue("leave_message");

      const config = await getGuildConfig(interaction.guild.id);
      config.welcomeMessage = welcome || null;
      config.leaveMessage = leave || null;
      await config.save();

      return interaction.update({ components: buildPortariaConfig(config) });
    }

    default:
      return;
  }
}

module.exports = { handleModal };
