const { PermissionFlagsBits } = require("discord.js");
const BumpState = require("../../database/models/BumpState");
const { getBumpConfig } = require("./store");
const { buildBumpMessage } = require("./render");

// Agendador do Bump Reminder: guarda quem bumpou, marca a hora do próximo bump e avisa na hora certa.
// Tudo fica no MongoDB, então um reinício do bot não perde o lembrete (initBump recarrega os pendentes).

const MAX_TIMEOUT = 2 ** 31 - 1; // limite do setTimeout (~24 dias)
const BOOT_DELAY_MS = 5_000; // lembretes atrasados (bot ficou off) saem 5s depois de ligar
const timers = new Map(); // guildId -> Timeout

const SEND_PERMS = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages;

function schedule(client, guildId, at, minDelay = 0) {
  clearTimeout(timers.get(guildId));
  const delay = Math.max(minDelay, at.getTime() - Date.now());
  const timer = setTimeout(() => {
    timers.delete(guildId);
    fire(client, guildId).catch((err) => console.error("[BUMP] Erro no lembrete:", err));
  }, Math.min(delay, MAX_TIMEOUT));
  timer.unref?.();
  timers.set(guildId, timer);
}

function cancel(guildId) {
  clearTimeout(timers.get(guildId));
  timers.delete(guildId);
}

async function canSendIn(channel) {
  if (!channel?.isTextBased?.() || !channel.guild) return false;
  const me = channel.guild.members.me ?? (await channel.guild.members.fetchMe().catch(() => null));
  return Boolean(me && channel.permissionsFor(me)?.has(SEND_PERMS));
}

// Marca só quem ainda está no servidor (quem saiu vira "<@id>" sem nome)
async function resolveUser(guild, userId) {
  if (!userId) return null;
  const member = await guild.members.fetch(userId).catch(() => null);
  return member ? { id: member.id, name: member.displayName } : null;
}

// Envia o lembrete agora. Retorna { ok, reason?, channelId? }
async function sendReminder(client, guildId, { force = false } = {}) {
  const cfg = await getBumpConfig(guildId);
  if (!force && (!cfg.enabled || !cfg.remind)) return { ok: false, reason: "disabled" };

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return { ok: false, reason: "guild" };

  const state = await BumpState.findOne({ guildId }).lean();
  const channelId = cfg.channelId || state?.lastChannelId;
  if (!channelId) return { ok: false, reason: "no_channel" };

  const channel = guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
  if (!(await canSendIn(channel))) return { ok: false, reason: "no_access", channelId };

  const user = cfg.mentionLastBumper ? await resolveUser(guild, state?.lastBumperId) : null;
  const now = new Date();
  const payload = buildBumpMessage("reminder", cfg, {
    guild,
    channelId,
    now,
    nextAt: now,
    lastBumpAt: state?.lastBumpAt ?? null,
    total: state?.totalBumps ?? 0,
    user,
    pingUser: cfg.mentionLastBumper,
    pingRoles: true,
  });

  const sent = await channel.send(payload);
  await BumpState.updateOne(
    { guildId },
    { $set: { reminderMessageId: sent.id, reminderChannelId: channel.id } },
    { upsert: true }
  );
  return { ok: true, channelId, messageId: sent.id };
}

// Chamado quando o prazo do bump chegou
async function fire(client, guildId) {
  // Só dispara se o prazo realmente chegou (o timer pode ter sido cortado pelo limite do setTimeout)
  const state = await BumpState.findOne({ guildId }).lean();
  if (!state || state.reminderSent || !state.nextBumpAt) return;
  if (state.nextBumpAt.getTime() > Date.now() + 1000) return schedule(client, guildId, state.nextBumpAt);

  // "Reserva" o lembrete de forma atômica: evita mandar duas vezes
  const claimed = await BumpState.findOneAndUpdate(
    { guildId, reminderSent: false, nextBumpAt: { $lte: new Date(Date.now() + 1000) } },
    { $set: { reminderSent: true } }
  );
  if (!claimed) return;

  const cfg = await getBumpConfig(guildId);
  if (!cfg.enabled || !cfg.remind) return;

  try {
    const result = await sendReminder(client, guildId);
    if (!result.ok && result.reason === "no_access") {
      console.warn(`[BUMP] Sem acesso ao canal do lembrete em ${guildId} (preciso de Ver Canal e Enviar Mensagens).`);
    }
  } catch (err) {
    console.error("[BUMP] Falha ao enviar o lembrete:", err.message);
  }

  // Repete o lembrete se ninguém der bump
  if (cfg.repeatMinutes > 0) {
    const next = new Date(Date.now() + cfg.repeatMinutes * 60_000);
    await BumpState.updateOne({ guildId }, { $set: { reminderSent: false, nextBumpAt: next } });
    schedule(client, guildId, next);
  }
}

/**
 * Alguém deu bump: salva quem foi, agenda o próximo lembrete e agradece.
 * { guild, channel, user (discord.js User), at: Date }
 */
async function registerBump(client, { guild, channel, user, at = new Date() }) {
  const cfg = await getBumpConfig(guild.id);
  if (!cfg.enabled) return;

  const nextAt = new Date(at.getTime() + cfg.intervalMinutes * 60_000);

  // Qualquer pessoa que bumpar vira "o último bumper" (inclusive se for outra que não a anterior)
  const previous = await BumpState.findOneAndUpdate(
    { guildId: guild.id },
    {
      $set: {
        lastBumperId: user.id,
        lastBumpAt: at,
        lastChannelId: channel.id,
        nextBumpAt: nextAt,
        reminderSent: false,
      },
      $inc: { totalBumps: 1 },
    },
    { upsert: true, new: false, setDefaultsOnInsert: true }
  ).lean();
  const total = (previous?.totalBumps ?? 0) + 1;

  schedule(client, guild.id, nextAt);

  // Apaga o lembrete antigo (opcional)
  if (cfg.deleteOldReminder && previous?.reminderMessageId && previous.reminderChannelId) {
    const old = guild.channels.cache.get(previous.reminderChannelId);
    old?.messages?.delete(previous.reminderMessageId).catch(() => {});
    BumpState.updateOne({ guildId: guild.id }, { $set: { reminderMessageId: "" } }).catch(() => {});
  }

  // Agradecimento
  if (cfg.thank && (await canSendIn(channel))) {
    const member = await guild.members.fetch(user.id).catch(() => null);
    const payload = buildBumpMessage("thanks", cfg, {
      guild,
      channelId: cfg.channelId || channel.id,
      now: at,
      nextAt,
      lastBumpAt: at,
      total,
      user: { id: user.id, name: member?.displayName ?? user.username },
      pingUser: cfg.thanksMention,
      pingRoles: false,
    });
    await channel.send(payload).catch((err) => console.error("[BUMP] Falha ao agradecer:", err.message));
  }
}

// Ao ligar o bot: recarrega os lembretes pendentes
async function initBump(client) {
  const pending = await BumpState.find({ reminderSent: false, nextBumpAt: { $ne: null } }).lean();
  let count = 0;
  for (const state of pending) {
    if (!client.guilds.cache.has(state.guildId)) continue;
    schedule(client, state.guildId, state.nextBumpAt, BOOT_DELAY_MS);
    count++;
  }
  if (count) console.log(`[BUMP] ${count} lembrete(s) de bump reagendado(s).`);
}

module.exports = { initBump, registerBump, sendReminder, cancel, resolveUser };
