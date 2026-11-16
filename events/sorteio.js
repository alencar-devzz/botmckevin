const { MessageFlags } = require("discord.js");
const Sorteio = require("../database/models/Sorteio");
const activity = require("../utils/sorteio/activity");
const engine = require("../utils/sorteio/engine");
const { noticeView } = require("../ui/sorteio");

// Tudo que o /sorteio precisa ouvir do Discord:
//  - mensagens: contagem para os requisitos
//  - voz: tempo em call
//  - convites: quantas pessoas cada convite trouxe
//  - reações: entrada por emoji
//  - rotinas: encerrar sorteios no prazo, monitor de requisitos e gravação dos contadores

const log = (label) => (err) => console.error(`[SORTEIO] ${label}:`, err?.message ?? err);
const normalize = (emoji) => String(emoji ?? "").replace(/\uFE0F/g, "").trim();

// ---------- convites ----------

const invites = new Map(); // guildId -> Map(código -> { uses, maxUses, inviterId })

async function cacheInvites(guild) {
  try {
    const list = await guild.invites.fetch();
    invites.set(
      guild.id,
      new Map(list.map((i) => [i.code, { uses: i.uses ?? 0, maxUses: i.maxUses ?? 0, inviterId: i.inviterId ?? i.inviter?.id ?? null }]))
    );
  } catch {
    // sem permissão de Gerenciar Servidor: o requisito de convites fica sem contagem
  }
}

async function countInvite(member) {
  const { guild } = member;
  const before = invites.get(guild.id);
  const list = await guild.invites.fetch().catch(() => null);
  if (!list) return;

  let inviterId = null;
  if (before) {
    for (const invite of list.values()) {
      if ((invite.uses ?? 0) > (before.get(invite.code)?.uses ?? 0)) {
        inviterId = invite.inviterId ?? invite.inviter?.id ?? null;
        break;
      }
    }
    if (!inviterId) {
      // convite de uso limitado some depois do último uso
      for (const [code, prev] of before) {
        if (!list.has(code) && prev.maxUses && prev.uses + 1 >= prev.maxUses) {
          inviterId = prev.inviterId;
          break;
        }
      }
    }
  }

  invites.set(
    guild.id,
    new Map(list.map((i) => [i.code, { uses: i.uses ?? 0, maxUses: i.maxUses ?? 0, inviterId: i.inviterId ?? i.inviter?.id ?? null }]))
  );
  if (inviterId && inviterId !== member.id && !member.user.bot) await activity.addInvites(guild.id, inviterId);
}

// ---------- eventos ----------

module.exports = [
  {
    name: "clientReady",
    once: true,
    async execute(client) {
      activity.seedVoice(client);
      for (const guild of client.guilds.cache.values()) cacheInvites(guild);

      setInterval(() => engine.sweepEnded(client).catch(log("encerramento")), 15_000);
      setInterval(() => engine.monitorSweep(client).catch(log("monitor")), 5 * 60_000);
      setInterval(() => activity.flush().catch(log("contadores")), 20_000);
    },
  },

  {
    name: "messageCreate",
    execute(message) {
      if (!message.guild || message.author.bot) return;
      activity.trackMessage(message.guild.id, message.author.id);
    },
  },

  {
    name: "voiceStateUpdate",
    execute(oldState, newState) {
      activity.onVoiceState(oldState, newState);
    },
  },

  { name: "guildMemberAdd", execute: (member) => countInvite(member).catch(() => {}) },
  { name: "inviteCreate", execute: (invite) => invite.guild && cacheInvites(invite.guild) },
  { name: "inviteDelete", execute: () => {} }, // o convite que some é tratado na próxima entrada

  {
    name: "messageReactionAdd",
    async execute(reaction, user) {
      if (user.bot) return;
      try {
        if (reaction.partial) await reaction.fetch();
        if (reaction.message.partial) await reaction.message.fetch();
      } catch {
        return;
      }

      const doc = await Sorteio.findOne({ messageId: reaction.message.id, status: "active", entryMode: "reaction" }).lean();
      if (!doc || normalize(reaction.emoji.toString()) !== normalize(doc.reactionEmoji)) return;

      const client = reaction.client;
      const guild = client.guilds.cache.get(doc.guildId);
      const member = await guild?.members.fetch(user.id).catch(() => null);
      if (!member) return;

      const result = await engine.tryEnter(client, doc, member);
      if (result.ok || result.already) return;

      await reaction.users.remove(user.id).catch(() => {});
      await user
        .send({ components: noticeView("Ainda não deu", result.reason, 0xed4245), flags: MessageFlags.IsComponentsV2 })
        .catch(() => {});
    },
  },

  {
    name: "messageReactionRemove",
    async execute(reaction, user) {
      if (user.bot) return;
      const doc = await Sorteio.findOne({ messageId: reaction.message.id, status: "active", entryMode: "reaction" }).lean();
      if (!doc || normalize(reaction.emoji.toString()) !== normalize(doc.reactionEmoji)) return;
      await engine.leave(reaction.client, doc, user.id);
    },
  },
];
