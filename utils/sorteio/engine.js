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
const { buildMessage, buildWinnerMessage, buildDmText } = require("./render");
const { parseEmoji } = require("../msgBuilder/render");
const D = require("./defaults");
const { fetchUserBio } = require("./fetchUserBio");

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

  if (where.includes("bio") && (req.patterns ?? []).length) {
    const bio = await fetchUserBio(member.id, { fresh });
    if (bio === null) {
      unknown = true;
    } else {
      const bioLower = bio.toLowerCase();
      if (req.patterns.some((p) => bioLower.includes(String(p).toLowerCase()))) return true;
    }
  }

  return unknown ? null : false;
}

// Requisitos de atividade (call, mensagens, convites): NÃO bloqueiam a entrada.
// Quem entrar sem cumprir só é avisado se ganhar. Retorna uma lista de { text, have }.
async function activityUnmet(doc, member) {
  const r = doc.req ?? {};
  const unmet = [];
  if (!(r.callMin > 0 || r.messages > 0 || r.invites > 0)) return unmet;

  const a = await getActivity(member.guild.id, member.id);
  if (r.callMin > 0 && a.voiceMin < r.callMin) unmet.push({ text: `${r.callMin} min em call`, have: `${a.voiceMin} min` });
  if (r.messages > 0 && a.messages < r.messages) unmet.push({ text: `${r.messages} mensagens`, have: `${a.messages}` });
  if (r.invites > 0 && a.invites < r.invites) unmet.push({ text: `${r.invites} convite(s)`, have: `${a.invites}` });
  return unmet;
}

// Requisitos de perfil (status, tag, bio): continuam bloqueando a entrada
async function profileUnmet(doc, member) {
  const r = doc.req ?? {};
  if (!(r.where ?? []).length) return [];

  const ok = await profileMatches(r, member, { fresh: true });
  if (ok === true) return [];

  const parts = [];
  if (r.where.includes("status") && (r.patterns ?? []).length) parts.push(`status com ${r.patterns.join(" ou ")}`);
  if (r.where.includes("tag")) parts.push("a tag do servidor no perfil");
  if (r.where.includes("bio") && (r.patterns ?? []).length) parts.push(`${r.patterns.join(" ou ")} na bio`);
  return [parts.join(" ou ") || "o perfil exigido"];
}

// Lista o que impede a pessoa de entrar agora (vazia = pode entrar).
// Só o perfil bloqueia; call/mensagens/convites são cobrados de quem ganhar.
async function checkRequirements(doc, member) {
  return profileUnmet(doc, member);
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

// Encerramento manual: apaga a embed principal (com os botões de entrar) do canal.
// Retorna true se a mensagem não existe mais.
async function deletePublic(client, doc) {
  const message = await fetchPublicMessage(client, doc);
  if (!message) return true;
  return message
    .delete()
    .then(() => true)
    .catch((err) => {
      console.error("[SORTEIO] Não consegui apagar a mensagem do sorteio:", err.message);
      return false;
    });
}

// Reroll: apaga a mensagem original do sorteio e envia uma nova com o resultado atualizado
async function repostPublic(client, doc) {
  const channel = await client.channels.fetch(doc.channelId).catch(() => null);
  if (!channel?.isTextBased()) return doc;

  const old = await channel.messages.fetch(doc.messageId).catch(() => null);
  const built = await buildMessage(doc);
  const sent = await channel
    .send({ components: built.components, files: built.files, flags: V2, allowedMentions: { parse: [] } })
    .catch((err) => {
      console.error("[SORTEIO] Não consegui enviar a nova mensagem:", err.message);
      return null;
    });
  if (!sent) {
    // sem conseguir enviar a nova, mantém a original (atualizada) em vez de ficar sem nada
    await refreshPublicNow(client, doc);
    return doc;
  }
  if (old) await old.delete().catch((err) => console.error("[SORTEIO] Não consegui apagar a mensagem original:", err.message));
  return (await updateSorteio(doc._id, { messageId: sent.id })) ?? { ...doc, messageId: sent.id };
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
    endedManually: false,
    endedBy: "",
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
      if ((await profileMatches(doc.req, member, { fresh: true })) === false) continue;
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

async function announce(client, guild, doc, winners, reroll, { deleted = false } = {}) {
  const win = doc.win ?? {};
  let channel = win.channelId ? await client.channels.fetch(win.channelId).catch(() => null) : null;
  if (!channel?.isTextBased()) channel = await client.channels.fetch(doc.channelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  const text = (c) => new TextDisplayBuilder().setContent(c);
  // se a mensagem do sorteio foi apagada (encerramento manual), não há link nem resposta para ela
  const link = deleted ? "" : messageUrl(doc);
  const allowedMentions = { users: win.mention === false ? [] : winners, repliedUser: false };
  const reply = !deleted && win.reply && doc.messageId && channel.id === doc.channelId ? { messageReference: doc.messageId, failIfNotExists: false } : undefined;

  const custom = await buildWinnerMessage(doc, { winners, reroll, guildName: guild.name, link });
  let sent = await channel
    .send({ components: custom.components, files: custom.files, flags: V2, allowedMentions, reply })
    .catch((err) => {
      console.error("[SORTEIO] Anúncio personalizado falhou, usando o padrão:", err.message);
      return null;
    });
  if (!sent) {
    // Se a versão personalizada não passar (texto grande, imagem inválida...), o resultado sai no modelo padrão
    const fallback = await buildWinnerMessage({ ...doc, win: { channelId: win.channelId } }, { winners, reroll, guildName: guild.name, link });
    sent = await channel
      .send({ components: fallback.components, files: fallback.files, flags: V2, allowedMentions })
      .catch((err) => console.error("[SORTEIO] Não consegui anunciar:", err.message));
  }

  await warnUnmetWinners(guild, channel, doc, winners);

  if (doc.dm?.enabled) {
    for (const id of winners) {
      const member = guild.members.cache.get(id) ?? (await guild.members.fetch(id).catch(() => null));
      if (!member) continue;
      const body = buildDmText(doc, { winnerId: id, guildName: guild.name, link });
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

// Avisa no canal quem ganhou sem ter cumprido os requisitos de call/mensagens/convites
async function warnUnmetWinners(guild, channel, doc, winners) {
  if (!winners.length) return;
  const r = doc.req ?? {};
  if (!(r.callMin > 0 || r.messages > 0 || r.invites > 0)) return;

  try {
    const members = await fetchMembers(guild, winners);
    const blocks = [];
    for (const id of winners) {
      const member = members.get(id);
      if (!member) continue;
      const unmet = await activityUnmet(doc, member);
      if (!unmet.length) continue;
      blocks.push(`<@${id}>\n${unmet.map((u) => `-# Faltou: **${u.text}** (tinha ${u.have})`).join("\n")}`);
    }
    if (!blocks.length) return;

    // divide em mensagens de até ~3500 caracteres para não estourar o limite do Discord
    const header = `### ⚠️ Ganhou, mas não cumpriu os requisitos\nQuem ganhou **${doc.prize}** sem completar o que o sorteio exigia:`;
    const pages = [];
    let current = [];
    let size = header.length;
    for (const block of blocks) {
      if (size + block.length > 3500 && current.length) {
        pages.push(current);
        current = [];
        size = header.length;
      }
      current.push(block);
      size += block.length + 2;
    }
    if (current.length) pages.push(current);

    for (const page of pages) {
      const container = new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`${header}\n\n${page.join("\n\n")}`));
      await channel
        .send({ components: [container], flags: V2, allowedMentions: { parse: [] } })
        .catch((err) => console.error("[SORTEIO] Não consegui avisar sobre requisitos:", err.message));
    }
  } catch (err) {
    console.error("[SORTEIO] Erro ao checar requisitos dos ganhadores:", err.message);
  }
}

// Encerra e sorteia. reroll=true sorteia outros vencedores num sorteio já encerrado.
async function finish(client, id, { reroll = false, manual = false, byId = "" } = {}) {
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

    const patch = reroll
      ? { winnerIds: winners, rerolls: (doc.rerolls ?? 0) + 1 }
      : { status: "ended", endedAt: new Date(), winnerIds: winners, endedManually: Boolean(manual), endedBy: manual ? String(byId || "") : "" };
    let updated = await updateSorteio(key, patch);
    let deleted = false;
    if (reroll) updated = await repostPublic(client, updated);
    else if (manual) deleted = await deletePublic(client, updated);
    if (!reroll && !deleted) await refreshPublicNow(client, updated);
    await announce(client, guild, updated, winners, reroll, { deleted });
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
  activityUnmet,
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
