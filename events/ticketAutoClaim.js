const { ChannelType, MessageFlags } = require("discord.js");
const { getPanel } = require("../utils/ticketPanelStore");
const { fallbackPanel, getOption } = require("../utils/ticketSettings");
const { findRecord, claimTicket } = require("../utils/ticketRecords");
const { loadTicketMedia } = require("../utils/ticketMedia");
const { buildTicketContainer, buildClaimedMessage } = require("../ui/ticket");

const V2 = MessageFlags.IsComponentsV2;

// ─── Cache em memória (deixa a reivindicação automática rápida) ───────────────
// Antes, TODA mensagem em tópico privado fazia consulta ao MongoDB (registro + painel) e a reivindicação
// só enviava o aviso depois de editar o painel (buscar mensagens, baixar imagens). Agora:
//  - "done": tópicos que não precisam mais de verificação (já assumidos, ou que não são ticket)
//  - "context": registro + painel de tickets ainda sem dono, por pouco tempo (a config do painel pode mudar)
const CONTEXT_TTL = 30_000; // 30s: se ligarem/desligarem a reivindicação automática, vale em até 30s
const NOT_TICKET_TTL = 10_000; // tópico sem registro (o registro pode ainda estar sendo criado)
const MAX_ENTRIES = 500;

const done = new Map(); // threadId -> expira em (ms) | Infinity
const context = new Map(); // threadId -> { record, panel, option, at }

function trim(map) {
  if (map.size <= MAX_ENTRIES) return;
  for (const key of [...map.keys()].slice(0, Math.floor(MAX_ENTRIES / 2))) map.delete(key);
}

function markDone(threadId, ttl = Infinity) {
  done.set(threadId, ttl === Infinity ? Infinity : Date.now() + ttl);
  context.delete(threadId);
  trim(done);
}

function isDone(threadId) {
  const until = done.get(threadId);
  if (until === undefined) return false;
  if (until === Infinity || until > Date.now()) return true;
  done.delete(threadId);
  return false;
}

// Registro + painel + opção do ticket (cache de 30s). null = não é ticket ou já foi assumido.
async function loadContext(guildId, threadId) {
  const hit = context.get(threadId);
  if (hit && Date.now() - hit.at < CONTEXT_TTL) return hit;

  const record = await findRecord(threadId);
  if (!record) {
    markDone(threadId, NOT_TICKET_TTL);
    return null;
  }
  if (record.claimedBy) {
    markDone(threadId);
    return null;
  }

  const panel = (await getPanel(record.panelId)) ?? fallbackPanel(guildId);
  const entry = { record, panel, option: getOption(panel, record.optionKey), at: Date.now() };
  context.set(threadId, entry);
  trim(context);
  return entry;
}

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

// Atualiza o painel do ticket (botão vira "Assumido" cinza e desativado). Roda em paralelo com o aviso.
async function updateTicketPanel(message, { record, panel, option }) {
  const { client, guild, channel } = message;
  // Só as imagens do ticket entram aqui: as do painel externo (MBs no MongoDB) não são usadas
  const [original, author, media] = await Promise.all([
    findTicketMessage(channel, client.user.id),
    client.users.cache.get(record.userId) ?? client.users.fetch(record.userId),
    loadTicketMedia(panel, { withData: true, onlyInternal: true }),
  ]);
  if (!original) return;

  await original.edit({
    components: [
      buildTicketContainer({
        panel,
        option,
        author,
        record,
        claimedBy: message.author,
        guildName: guild.name,
        media,
      }),
    ],
    files: media.internal.files,
    attachments: [],
    flags: V2,
    allowedMentions: { parse: [] },
  });
}

module.exports = {
  name: "messageCreate",
  async execute(message) {
    try {
      if (message.author.bot || message.system || !message.guild) return;
      if (message.channel.type !== ChannelType.PrivateThread) return;
      if (isDone(message.channel.id)) return; // já assumido ou não é ticket: sem consulta nenhuma

      const ctx = await loadContext(message.guild.id, message.channel.id);
      if (!ctx) return;
      const { record, panel, option } = ctx;

      if (message.author.id === record.userId) return; // quem abriu o ticket não assume o próprio
      if (!panel.autoClaim) return;

      const member = message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
      if (!member || !isStaff(member, panel, option)) return;

      // Atômico: se dois staffs escreverem juntos, só um assume
      const claimed = await claimTicket(message.channel.id, message.author.id);
      markDone(message.channel.id); // assumido (por nós ou por outro): nunca mais verificar este tópico
      if (!claimed) return;

      // O aviso sai NA HORA (antes ele esperava o painel ser atualizado) e o painel é atualizado em paralelo.
      // Uma mensagem só: menção do autor em cima (fora do container) + container. Só o autor é pingado.
      const notice = message.channel.send({
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
      const refresh = updateTicketPanel(message, ctx).catch((err) =>
        console.error("[TICKET] Erro ao atualizar o painel na reivindicação automática:", err.message)
      );

      await notice;
      await refresh;
    } catch (err) {
      console.error("[TICKET] Erro na reivindicação automática:", err);
    }
  },
};
