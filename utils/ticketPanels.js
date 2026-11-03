const { MessageFlags } = require("discord.js");
const { buildTicketPanel } = require("../ui/ticket");
const { getPanel, updatePanel } = require("./ticketPanelStore");
const { loadTicketMedia } = require("./ticketMedia");

const MAX_TRACKED = 20;

// Envia o painel num canal e passa a acompanhá-lo (atualiza quando a configuração muda)
async function sendTicketPanel(channel, panel) {
  const media = await loadTicketMedia(panel, { withData: true });

  const message = await channel.send({
    components: buildTicketPanel(panel, media),
    files: media.panel.files,
    flags: MessageFlags.IsComponentsV2,
  });

  const sent = panel.sent.filter((p) => p.messageId !== message.id);
  sent.push({ channelId: channel.id, messageId: message.id });
  await updatePanel(panel.id, { sent: sent.slice(-MAX_TRACKED) });

  return message;
}

// Edita todos os painéis já enviados para refletir a configuração atual.
// Retorna quantos continuam existindo.
async function refreshTicketPanels(client, panelOrId) {
  const panel = typeof panelOrId === "string" ? await getPanel(panelOrId) : panelOrId;
  if (!panel) return 0;

  const media = await loadTicketMedia(panel, { withData: true });
  const alive = [];

  for (const ref of panel.sent) {
    try {
      const channel = await client.channels.fetch(ref.channelId);
      const message = await channel.messages.fetch(ref.messageId);
      await message.edit({
        components: buildTicketPanel(panel, media),
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

  if (alive.length !== panel.sent.length) await updatePanel(panel.id, { sent: alive });
  return alive.length;
}

// Apaga as mensagens enviadas do painel. Retorna quantas foram apagadas.
async function deleteSentPanels(client, panel) {
  let removed = 0;
  for (const ref of panel.sent) {
    try {
      const channel = await client.channels.fetch(ref.channelId);
      const message = await channel.messages.fetch(ref.messageId);
      await message.delete();
      removed++;
    } catch {
      // já apagada
    }
  }
  await updatePanel(panel.id, { sent: [] });
  return removed;
}

module.exports = { sendTicketPanel, refreshTicketPanels, deleteSentPanels };
