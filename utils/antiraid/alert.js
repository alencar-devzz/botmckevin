const { MessageFlags, ContainerBuilder, TextDisplayBuilder } = require("discord.js");

// Alerta padrão dos módulos: container com título e linhas de detalhe.
// channelId vazio = usa o canal de alertas do núcleo.
async function sendModuleAlert(guild, cfg, channelId, { title, lines, color = 0xfaa61a }) {
  const id = channelId || cfg.core.alertChannelId;
  const channel = id ? guild.channels.cache.get(id) : null;
  if (!channel?.isTextBased()) return;
  await channel
    .send({
      components: [
        new ContainerBuilder()
          .setAccentColor(color)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### ${title}`),
            new TextDisplayBuilder().setContent(lines.join("\n"))
          ),
      ],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    })
    .catch(() => {});
}

module.exports = { sendModuleAlert };
