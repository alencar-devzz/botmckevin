const {
  ActivityType,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");
const Sorteio = require("../../database/models/Sorteio");
const { getSorteio, updateSorteio } = require("./store");
const { getActivity } = require("./activity");
const { buildMessage, buildDmText } = require("./render");
const { parseEmoji } = require("../msgBuilder/render");
const D = require("./defaults");

const V2 = MessageFlags.IsComponentsV2;
const finishing = new Set();
const refreshTimers = new Map();

const messageUrl = (doc) => `https://discord.com/channels/${doc.guildId}/${doc.channelId}/${doc.messageId}`;

// ---------- requisitos ----------

// true = cumpre, false = não cumpre, null = não deu para saber (só no monitor)
async function profileMatches(req, member, { fresh }) {
  const where = req.where ?? [];
  let unknown = false;

  if (where.includes("status") && (req.patterns ?? []).length) {
    const custom = member.presence?.activities?.find((a) => a.type === ActivityType.Custom);
    const text = `${custom?.state ?? ""} ${custom?.name ?? ""}`.toLowerCase();
    if (req.patterns.some((p) => text.includes(String(p).toLowerCase()))) return true;
  }

  if (where.includes("tag")) {
    let user = member.user;
    if (fresh) user = await user.fetch(true).catch(() => user);
    const guildTag = user.primaryGuild;
    if (guildTag === undefined) unknown = true;
    else if (guildTag && guildTag.identityGuildId === member.guild.id && guildTag.identityEnabled !== false) return true;
  }

  return unknown ? null : false;
}

// Lista o que a pessoa ainda não cumpre (vazia = pode entrar)
async function checkRequirements(doc, member) {
  const r = doc.req ?? {};
  const unmet = [];

  if (r.callMin > 0 || r.messages > 0 || r.invites > 0) {
    const a = await getActivity(member.guild.id, member.id);
    if (r.callMin > 0 && a.voiceMin < r.callMin) unmet.push(`${r.callMin} min em call (você tem ${a.voiceMin})`);
    if (r.messages > 0 && a.messages < r.messages) unmet.push(`${r.messages} mensagens (você tem ${a.messages})`);
    if (r.invites > 0 && a.invites < r.invites) unmet.push(`${r.invites} convite(s) (você tem ${a.invites})`);
  }

  if ((r.where ?? []).length) {
    const ok = await profileMatches(r, member, { fresh: true });
    if (ok !== true) {
      const parts = [];
      if (r.where.includes("status") && (r.patterns ?? []).length) parts.push(`status com ${r.patterns.join(" ou ")}`);
      if (r.where.includes("tag")) parts.push("a tag do servidor no perfil");
      unmet.push(parts.join(" ou ") || "o perfil exigido");
    }
  }
  return unmet;
}

// ---------- mensagem pública ----------

async function fetchPublicMessage(client, doc) {
  if (!doc?.channelId || !doc?.messageId) return null;
  const channel = await client.channels.fetch(doc.channelId).catch(() => null);
  if (!channel?.messages) return null;
  return channel.messages.fetch(doc.messageId).catch(() => null);
}

async function refreshPublicNow(client, doc) {
  const message = await fetchPublicMessage(client, doc);
  if (!message) return false;
  const built = await buildMessage(doc);
  await message
    .edit({ components: built.components, files: built.files, attachments: [], flags: V2, allowedMentions: { parse: [] } })
    .catch((err) => console.error("[SORTEIO] Não consegui atualizar a mensagem:", err.message));
  return true;
}

// Muita gente entrando junto não pode virar uma edição por clique: agrupa em uma a cada poucos segundos
function scheduleRefresh(client, id) {
  const key = String(id);
  if (refreshTimers.has(key)) return;
  refreshTimers.set(
    key,
    setTimeout(async () => {
      refreshTimers.delete(key);
      const doc = await getSorteio(key).catch(() => null);
      if (doc && doc.status === "active") await refreshPublicNow(client, doc).catch(() => {});
    }, 4000)
  );
}

// ---------- entrar e sair ----------

async function tryEnter(client, doc, member) {
  if (!doc || doc.status !== "active" || (doc.endsAt && new Date(doc.endsAt) <= new Date())) {
    return { ok: false, reason: "Esse sorteio já foi encerrado." };
  }
  if (member.user.bot) return { ok: false, reason: "Bots não participam." };
  if (doc.entries.some((e) => e.userId === member.id)) return { ok: false, already: true };

  const unmet = await checkRequirements(doc, member);
  if (unmet.length) return { ok: false, reason: `Você ainda não cumpre: ${unmet.join("; ")}.`, unmet };

  const result = await Sorteio.updateOne(
    { _id: doc._id, status: "active", "entries.userId": { $ne: member.id } },
    { $push: { entries: { userId: member.id, at: new Date() } } }
  );
  if (!result.modifiedCount) return { ok: false, already: true };
  scheduleRefresh(client, doc._id);
  return { ok: true };
}

async function leave(client, doc, userId) {
  const result = await Sorteio.updateOne({ _id: doc._id, status: "active" }, { $pull: { entries: { userId } } });
  if (result.modifiedCount) scheduleRefresh(client, doc._id);
  return Boolean(result.modifiedCount);
}

// ---------- publicar ----------

async function publish(client, doc) {
  const guild = client.guilds.cache.get(doc.guildId);
  if (!guild) return { error: "Não encontrei o servidor." };
  if (!doc.prize.trim()) return { error: "Defina o prêmio antes de publicar." };
  if (!doc.channelId) return { error: "Escolha o canal onde o sorteio vai ser publicado." };
  if (!doc.durationMs || doc.durationMs < D.LIMITS.minDurationMs) return { error: "Defina a duração (mínimo de 1 minuto)." };
  if (doc.entryMode === "reaction" && !parseEmoji(doc.reactionEmoji).value) {
    return { error: "A entrada por reação precisa de um emoji. Defina o emoji da reação." };
  }
  const r = doc.req ?? {};
  if ((r.where ?? []).includes("status") && !(r.patterns ?? []).length && !r.where.includes("tag")) {
    return { error: "O requisito de status precisa de pelo menos um padrão. Defina os padrões ou desmarque o status." };
  }

  const channel = await guild.channels.fetch(doc.channelId).catch(() => null);
  if (!channel?.isTextBased() || channel.isThread?.()) return { error: "O canal escolhido não aceita mensagens de texto." };
  const needs = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
  if (doc.entryMode === "reaction") needs.push(PermissionFlagsBits.AddReactions);
  if (!channel.permissionsFor(guild.members.me)?.has(needs)) {
    return { error: `Falta permissão para eu enviar mensagens em <#${channel.id}>.` };
  }

  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + doc.durationMs);
  const live = { ...doc, status: "active", endsAt, entries: [] };
  const built = await buildMessage(live);
  if (built.problems.length) return { error: built.problems.join("\n") };

  const sent = await channel.send({ components: built.components, files: built.files, flags: V2, allowedMentions: { parse: [] } });
  if (doc.entryMode === "reaction") await sent.react(doc.reactionEmoji).catch(() => {});

  const updated = await updateSorteio(doc._id, {
    status: "active",
    messageId: sent.id,
    startedAt,
    endsAt,
    endedAt: null,
    entries: [],
    winnerIds: [],
    rerolls: 0,
  });
  return { doc: updated, url: messageUrl(updated) };
}

// ---------- sorteio ----------

async function fetchMembers(guild, ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const got = await guild.members.fetch({ user: ids.slice(i, i + 100) }).catch(() => null);
    if (got) for (const member of got.values()) out.set(member.id, member);
  }
  return out;
}

const ticketsOf = (doc, member) =>
  1 + (doc.extras ?? []).reduce((sum, e) => sum + (member.roles.cache.has(e.roleId) ? Math.max(0, e.extra) : 0), 0);

async function pickWinners(guild, doc, exclude = []) {
  const ids = doc.entries.map((e) => e.userId).filter((id) => !exclude.includes(id));
  const members = await fetchMembers(guild, ids);

  const pool = [];
  for (const member of members.values()) {
    if (member.user.bot) continue;
    if (doc.req?.monitor && (doc.req.where ?? []).length) {
      if ((await profileMatches(doc.req, member, { fresh: false })) === false) continue;
    }
    pool.push({ id: member.id, weight: ticketsOf(doc, member) });
  }

  const winners = [];
  while (pool.length && winners.length < doc.winners) {
    let roll = Math.random() * pool.reduce((sum, p) => sum + p.weight, 0);
    let index = pool.findIndex((p) => (roll -= p.weight) < 0);
    if (index < 0) index = pool.length - 1;
    winners.push(pool.splice(index, 1)[0].id);
  }
  return winners;
}

async function announce(client, guild, doc, winners, reroll) {
  const channel = await client.channels.fetch(doc.channelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  const text = (c) => new TextDisplayBuilder().setContent(c);
  const box = new ContainerBuilder().setAccentColor(0x57f287);
  box.addTextDisplayComponents(text(reroll ? `## Novo sorteio de vencedores` : `## Sorteio encerrado`));
  box.addSeparatorComponents(new SeparatorBuilder());
  box.addTextDisplayComponents(
    text(
      [
        `**Prêmio**  ${doc.prize}`,
        winners.length ? `**Vencedores**  ${winners.map((id) => `<@${id}>`).join(" ")}` : "**Vencedores**  ninguém se inscreveu de forma válida",
        winners.length ? "-# Fale com a organização para combinar a entrega." : "",
      ]
        .filter(Boolean)
        .join("\n")
    )
  );
  box.addActionRowComponents(
    new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Abrir o sorteio").setURL(messageUrl(doc)))
  );

  await channel
    .send({ components: [box], flags: V2, allowedMentions: { users: winners } })
    .catch((err) => console.error("[SORTEIO] Não consegui anunciar:", err.message));

  if (doc.dm?.enabled) {
    for (const id of winners) {
      const member = guild.members.cache.get(id) ?? (await guild.members.fetch(id).catch(() => null));
      if (!member) continue;
      const body = buildDmText(doc, { winnerId: id, guildName: guild.name, link: messageUrl(doc) });
      await member
        .send({
          components: [new ContainerBuilder().addTextDisplayComponents(text(`### ${doc.name}`), text(body))],
          flags: V2,
          allowedMentions: { parse: [] },
        })
        .catch(() => {}); // DMs fechadas
    }
  }
}

// Encerra e sorteia. reroll=true sorteia outros vencedores num sorteio já encerrado.
async function finish(client, id, { reroll = false } = {}) {
  const key = String(id);
  if (finishing.has(key)) return { error: "Esse sorteio já está sendo processado." };
  finishing.add(key);
  try {
    const doc = await getSorteio(key);
    if (!doc) return { error: "Sorteio não encontrado." };
    if (!reroll && doc.status !== "active") return { error: "Esse sorteio não está em andamento." };
    if (reroll && doc.status !== "ended") return { error: "Só dá para sortear de novo depois que o sorteio termina." };

    const guild = client.guilds.cache.get(doc.guildId) ?? (await client.guilds.fetch(doc.guildId).catch(() => null));
    if (!guild) return { error: "Não encontrei o servidor." };

    const winners = await pickWinners(guild, doc, reroll ? doc.winnerIds : []);
    if (reroll && !winners.length) return { error: "Não sobrou ninguém elegível além dos vencedores anteriores." };

    const patch = reroll ? { winnerIds: winners, rerolls: (doc.rerolls ?? 0) + 1 } : { status: "ended", endedAt: new Date(), winnerIds: winners };
    const updated = await updateSorteio(key, patch);
    await refreshPublicNow(client, updated);
    await announce(client, guild, updated, winners, reroll);
    return { doc: updated, winners };
  } finally {
    finishing.delete(key);
  }
}

// ---------- rotinas ----------

async function sweepEnded(client) {
  const due = await Sorteio.find({ status: "active", endsAt: { $lte: new Date() } }).select("_id").lean();
  for (const { _id } of due) {
    await finish(client, _id).catch((err) => console.error("[SORTEIO] Erro ao encerrar:", err.message));
  }
}

// Monitor de requisitos: tira da lista quem saiu do servidor ou deixou de cumprir o requisito de perfil
async function monitorSweep(client) {
  const docs = await Sorteio.find({ status: "active", "req.monitor": true }).lean();
  for (const doc of docs) {
    if (!doc.entries.length) continue;
    const guild = client.guilds.cache.get(doc.guildId);
    if (!guild) continue;

    const members = await fetchMembers(guild, doc.entries.map((e) => e.userId));
    const drop = [];
    for (const entry of doc.entries) {
      const member = members.get(entry.userId);
      if (!member) {
        drop.push(entry.userId);
        continue;
      }
      if ((doc.req.where ?? []).length && (await profileMatches(doc.req, member, { fresh: false })) === false) drop.push(entry.userId);
    }
    if (drop.length) {
      await Sorteio.updateOne({ _id: doc._id }, { $pull: { entries: { userId: { $in: drop } } } });
      scheduleRefresh(client, doc._id);
    }
  }
}

module.exports = {
  checkRequirements,
  tryEnter,
  leave,
  publish,
  finish,
  refreshPublicNow,
  scheduleRefresh,
  sweepEnded,
  monitorSweep,
  messageUrl,
};
