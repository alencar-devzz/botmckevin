const { ChannelType, MessageFlags } = require("discord.js");
const { getPanel } = require("../utils/ticketPanelStore");
const { fallbackPanel, getOption } = require("../utils/ticketSettings");
const { findRecord, claimTicket } = require("../utils/ticketRecords");
const { loadTicketMedia } = require("../utils/ticketMedia");
const { buildTicketContainer, buildClaimedMessage } = require("../ui/ticket");

const V2 = MessageFlags.IsComponentsV2;

// Cargos que podem assumir: os do painel + os próprios da opção (mesma regra do botão "Assumir")
function isStaff(member, panel, option) {
  const roles = [...new Set([...panel.attendRoles, ...(option?.staffRoles ?? [])])];
  return roles.length > 0 && member.roles.cache.hasAny(...roles);
}

// Acha a mensagem do ticket (a que tem o botão Assumir) nas primeiras mensagens do tópico
async function findTicketMessage(thread, botId) {
  const batch = await thread.messages.fetch({ after: "0", limit: 10 }).catch(() => null);
  if (!batch) return null;
  return (
    batch.find((m) => m.author.id === botId && JSON.stringify(m.components ?? []).includes("ticket_claim:")) ?? null
  );
}

module.exports = {
  name: "messageCreate",
  async execute(message) {
    try {
      if (message.author.bot || message.system || !message.guild) return;
      if (message.channel.type !== ChannelType.PrivateThread) return;

      const record = await findRecord(message.channel.id);
      if (!record || record.claimedBy) return;
      if (message.author.id === record.userId) return; // quem abriu o ticket não assume o próprio

      const panel = (await getPanel(record.panelId)) ?? fallbackPanel(message.guild.id);
      if (!panel.autoClaim) return;

      const option = getOption(panel, record.optionKey);
      const member = message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
      if (!member || !isStaff(member, panel, option)) return;

      // Atômico: se dois staffs escreverem juntos, só um assume
      const claimed = await claimTicket(message.channel.id, message.author.id);
      if (!claimed) return;

      // Atualiza o painel do ticket (botão vira "Assumido" cinza e desativado)
      try {
        const original = await findTicketMessage(message.channel, message.client.user.id);
        if (original) {
          const author = await message.client.users.fetch(record.userId);
          const media = await loadTicketMedia(panel, { withData: true });
          await original.edit({
            components: [
              buildTicketContainer({
                panel,
                option,
                author,
                record,
                claimedBy: message.author,
                guildName: message.guild.name,
                media,
              }),
            ],
            files: media.internal.files,
            attachments: [],
            flags: V2,
            allowedMentions: { parse: [] },
          });
        }
      } catch (err) {
        console.error("[TICKET] Erro ao atualizar o painel na reivindicação automática:", err.message);
      }

      // Uma mensagem só: menção do autor em cima (fora do container) + container. Só o autor é pingado.
      await message.channel.send({
        components: buildClaimedMessage({
          panel,
          staffId: message.author.id,
          authorId: record.userId,
          timestamp: Math.floor(Date.now() / 1000),
          guildName: message.guild.name,
        }),
        flags: V2,
        allowedMentions: { users: [record.userId] },
      });
    } catch (err) {
      console.error("[TICKET] Erro na reivindicação automática:", err);
    }
  },
};
