const { MessageFlags } = require("discord.js");
const { buildTicketPanel } = require("../ui/ticket");
const { getTicketSettings, updateTicketConfig } = require("./ticketSettings");
const { loadTicketMedia } = require("./ticketMedia");

const MAX_TRACKED_PANELS = 20;

// Envia o painel de tickets num canal e passa a acompanhá-lo (atualiza quando a configuração muda)
async function sendTicketPanel(channel) {
  const settings = await getTicketSettings(channel.guild.id);
  const media = await loadTicketMedia(settings, { withData: true });

  const message = await channel.send({
    components: buildTicketPanel(settings, media),
    files: media.panel.files,
    flags: MessageFlags.IsComponentsV2,
  });

  const panels = settings.panels.filter((p) => p.messageId !== message.id);
  panels.push({ channelId: channel.id, messageId: message.id });
  await updateTicketConfig(channel.guild.id, { panels: panels.slice(-MAX_TRACKED_PANELS) });

  return message;
}

// Edita todos os painéis já enviados para refletir a configuração atual
async function refreshTicketPanels(client, guildId, knownSettings = null) {
  const settings = knownSettings ?? (await getTicketSettings(guildId));
  const media = await loadTicketMedia(settings, { withData: true });
  const alive = [];

  for (const ref of settings.panels) {
    try {
      const channel = await client.channels.fetch(ref.channelId);
      const message = await channel.messages.fetch(ref.messageId);
      await message.edit({
        components: buildTicketPanel(settings, media),
        files: media.panel.files,
        attachments: [], // troca os anexos antigos pelos atuais
        flags: MessageFlags.IsComponentsV2,
      });
      alive.push(ref);
    } catch (err) {
      // 10003 = canal apagado, 10008 = mensagem apagada: para de acompanhar. Outros erros: mantém.
      if (err.code !== 10003 && err.code !== 10008) alive.push(ref);
    }
  }

  if (alive.length !== settings.panels.length) {
    await updateTicketConfig(guildId, { panels: alive });
  }
  return alive.length;
}

module.exports = { sendTicketPanel, refreshTicketPanels };
