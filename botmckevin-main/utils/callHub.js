const {
  ChannelType,
  OverwriteType,
  PermissionFlagsBits: P,
  PermissionsBitField,
  MessageFlags,
} = require("discord.js");
const CallRoom = require("../database/models/CallRoom");
const CallProfile = require("../database/models/CallProfile");
const { getCallHubConfig } = require("./callHubStore");
const { buildCallPanel } = require("../ui/callPanel");

// ======================= Estado em memória =======================
// channelId -> { channelId, guildId, ownerId }. O banco (CallRoom) guarda o mesmo para sobreviver a reinícios.
const rooms = new Map();
const creating = new Set(); // "guildId:userId" criando agora (evita call duplicada)
const lastCreate = new Map(); // "guildId:userId" -> timestamp (cooldown)
const timers = new Map(); // channelId -> timeout de exclusão

const humansIn = (channel) => channel.members.filter((m) => !m.user.bot);

function getRoom(channelId) {
  return rooms.get(channelId) ?? null;
}

function getRoomByOwner(guildId, ownerId) {
  for (const room of rooms.values()) {
    if (room.guildId === guildId && room.ownerId === ownerId) return room;
  }
  return null;
}

async function forgetRoom(channelId) {
  clearTimeout(timers.get(channelId));
  timers.delete(channelId);
  rooms.delete(channelId);
  await CallRoom.deleteOne({ channelId }).catch(() => {});
}

async function deleteRoomChannel(channel) {
  await forgetRoom(channel.id);
  await channel.delete("Call temporária vazia").catch(() => {});
}

// ======================= Perfil pessoal (blacklist / config salva) =======================

async function getProfile(guildId, userId) {
  return CallProfile.findOne({ guildId, userId }).lean();
}

async function updateProfile(guildId, userId, patch) {
  return CallProfile.findOneAndUpdate(
    { guildId, userId },
    { $set: patch },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
}

// ======================= Permissões do canal =======================

const isLocked = (channel) => channel.permissionOverwrites.cache.get(channel.guild.id)?.deny.has(P.Connect) ?? false;

const memberOverwrites = (channel) =>
  channel.permissionOverwrites.cache.filter((o) => o.type === OverwriteType.Member);

const allowedMemberIds = (channel, ownerId) =>
  memberOverwrites(channel)
    .filter((o) => o.allow.has(P.Connect) && o.id !== ownerId)
    .map((o) => o.id);

const blockedMemberIds = (channel) =>
  memberOverwrites(channel)
    .filter((o) => o.deny.has(P.Connect))
    .map((o) => o.id);

async function fetchUser(client, id) {
  return client.users.cache.get(id) ?? (await client.users.fetch(id).catch(() => null));
}

async function allowUser(channel, userId) {
  const user = await fetchUser(channel.client, userId);
  if (!user) return false;
  await channel.permissionOverwrites.edit(user, { ViewChannel: true, Connect: true });
  return true;
}

async function denyUser(channel, userId) {
  const user = await fetchUser(channel.client, userId);
  if (!user) return false;
  await channel.permissionOverwrites.edit(user, { Connect: false });
  return true;
}

// Tira a permissão de entrada (não mexe em quem está bloqueado)
async function clearUser(channel, userId) {
  const overwrite = channel.permissionOverwrites.cache.get(userId);
  if (!overwrite || overwrite.deny.has(P.Connect)) return false;
  await overwrite.delete().catch(() => {});
  return true;
}

// Libera de novo uma pessoa bloqueada (remove o bloqueio de entrada)
async function unblockUser(channel, userId) {
  const overwrite = channel.permissionOverwrites.cache.get(userId);
  if (!overwrite || !overwrite.deny.has(P.Connect)) return false;
  await overwrite.delete().catch(() => {});
  return true;
}

async function setLocked(channel, locked) {
  await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { Connect: locked ? false : null });
}

// Privar: fecha a call e deixa entrar só o dono + as pessoas escolhidas
async function applyLock(channel, room, selectedIds) {
  await setLocked(channel, true);
  await allowUser(channel, room.ownerId);

  const keep = new Set([room.ownerId, ...selectedIds]);
  for (const id of allowedMemberIds(channel, room.ownerId)) {
    if (!keep.has(id)) await clearUser(channel, id);
  }
  for (const id of selectedIds) {
    if (id !== room.ownerId) await allowUser(channel, id);
  }
}

async function transferOwnership(channel, newOwnerId) {
  const room = rooms.get(channel.id);
  if (!room) return false;
  room.ownerId = newOwnerId;
  await CallRoom.updateOne({ channelId: channel.id }, { $set: { ownerId: newOwnerId } }).catch(() => {});
  await allowUser(channel, newOwnerId).catch(() => {});
  return true;
}

// ======================= Criação =======================

function renderCallName(template, member) {
  const vars = {
    nametag: member.displayName,
    username: member.user.username,
    globalname: member.user.globalName ?? member.user.username,
  };
  const name = String(template)
    .replace(/\{(nametag|username|globalname)\}/gi, (_, key) => vars[key.toLowerCase()])
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return name || member.displayName.slice(0, 100) || "Call";
}

async function createCall(state, cfg) {
  const { guild, member } = state;
  const key = `${guild.id}:${member.id}`;
  if (creating.has(key)) return;
  creating.add(key);

  try {
    if (cfg.blockedRoles.length && member.roles.cache.hasAny(...cfg.blockedRoles)) return;
    if (cfg.allowedRoles.length && !member.roles.cache.hasAny(...cfg.allowedRoles)) return;

    // Já tem uma call: leva a pessoa de volta para ela em vez de criar outra
    const existing = getRoomByOwner(guild.id, member.id);
    if (existing) {
      const channel = guild.channels.cache.get(existing.channelId);
      if (channel) {
        await member.voice.setChannel(channel).catch(() => {});
        return;
      }
      await forgetRoom(existing.channelId);
    }

    if (cfg.cooldown > 0) {
      const wait = (lastCreate.get(key) ?? 0) + cfg.cooldown * 1000 - Date.now();
      if (wait > 0) return;
    }

    const me = guild.members.me;
    if (!me.permissions.has([P.ManageChannels, P.MoveMembers])) {
      console.error(`[CALLS] Faltam as permissões Gerenciar Canais e Mover Membros em ${guild.name}.`);
      return;
    }

    const trigger = state.channel;
    const profile = await getProfile(guild.id, member.id);

    // Permissões: copia as do canal gatilho e acrescenta dono, blacklist e privacidade
    const map = new Map();
    for (const o of trigger.permissionOverwrites.cache.values()) {
      map.set(o.id, { id: o.id, type: o.type, allow: new PermissionsBitField(o.allow), deny: new PermissionsBitField(o.deny) });
    }
    const entry = (id, type) => {
      if (!map.has(id)) map.set(id, { id, type, allow: new PermissionsBitField(), deny: new PermissionsBitField() });
      return map.get(id);
    };
    const grant = (id, type, perms) => {
      const e = entry(id, type);
      e.allow.add(perms);
      e.deny.remove(perms);
    };
    const block = (id, type, perms) => {
      const e = entry(id, type);
      e.deny.add(perms);
      e.allow.remove(perms);
    };

    if (cfg.defaultPrivate) block(guild.id, OverwriteType.Role, [P.Connect]);
    grant(member.id, OverwriteType.Member, [P.ViewChannel, P.Connect]);
    for (const id of profile?.blacklist ?? []) {
      if (id !== member.id) block(id, OverwriteType.Member, [P.Connect]);
    }

    const category = cfg.categoryId ? guild.channels.cache.get(cfg.categoryId) : null;
    const parent = category?.type === ChannelType.GuildCategory ? category.id : trigger.parentId ?? undefined;

    const channel = await guild.channels.create({
      name: renderCallName(cfg.nameTemplate, member),
      type: ChannelType.GuildVoice,
      parent,
      userLimit: cfg.defaultLimit,
      bitrate: Math.min(trigger.bitrate || 64000, guild.maximumBitrate || 96000),
      rtcRegion: trigger.rtcRegion ?? undefined,
      permissionOverwrites: [...map.values()],
      reason: `Call temporária de ${member.user.tag}`,
    });

    const moved = await member.voice.setChannel(channel).then(() => true).catch(() => false);
    if (!moved) {
      // A pessoa saiu antes de ser movida: não deixa call vazia para trás
      await channel.delete("Dono saiu antes de entrar na call").catch(() => {});
      return;
    }

    lastCreate.set(key, Date.now());
    rooms.set(channel.id, { channelId: channel.id, guildId: guild.id, ownerId: member.id });
    await CallRoom.create({ guildId: guild.id, channelId: channel.id, ownerId: member.id }).catch(() => {});

    if (cfg.sendPanel) {
      await channel
        .send({
          components: buildCallPanel(cfg, guild),
          flags: MessageFlags.IsComponentsV2,
          allowedMentions: { parse: [] },
        })
        .catch((err) => console.error("[CALLS] Não consegui enviar o painel no chat da call:", err.message));
    }
  } catch (err) {
    console.error("[CALLS] Erro ao criar a call:", err);
  } finally {
    creating.delete(key);
  }
}

// ======================= Saídas / exclusão =======================

function scheduleDelete(channel, delaySeconds) {
  clearTimeout(timers.get(channel.id));

  const run = async () => {
    timers.delete(channel.id);
    const fresh = channel.guild.channels.cache.get(channel.id);
    if (!fresh) return forgetRoom(channel.id);
    if (humansIn(fresh).size === 0) await deleteRoomChannel(fresh);
  };

  if (delaySeconds <= 0) return run();
  timers.set(channel.id, setTimeout(run, delaySeconds * 1000));
}

async function handleLeave(guild, channelId, userId) {
  const room = rooms.get(channelId);
  if (!room) return;

  const channel = guild.channels.cache.get(channelId);
  if (!channel) return forgetRoom(channelId);

  const cfg = await getCallHubConfig(guild.id);
  const humans = humansIn(channel);

  if (humans.size === 0) return scheduleDelete(channel, cfg.deleteDelay);

  // O dono saiu e ainda tem gente: passa o controle (quem já é dono de outra call não entra na fila)
  if (room.ownerId === userId && cfg.autoTransfer) {
    const next = humans.find((m) => !getRoomByOwner(guild.id, m.id));
    if (next) await transferOwnership(channel, next.id);
  }
}

async function onVoiceStateUpdate(oldState, newState) {
  const { guild } = newState;
  const member = newState.member ?? oldState.member;
  if (!guild || !member) return;

  const left = oldState.channelId && oldState.channelId !== newState.channelId ? oldState.channelId : null;
  const joined = newState.channelId && newState.channelId !== oldState.channelId ? newState.channelId : null;

  if (joined && !member.user.bot) {
    const cfg = await getCallHubConfig(guild.id);
    if (cfg.enabled && cfg.triggerChannelId === joined) await createCall(newState, cfg);
  }

  if (left) await handleLeave(guild, left, member.id);
}

// Ao ligar o bot: apaga calls que ficaram vazias e recarrega as que continuam em uso
async function sweepCalls(client) {
  const docs = await CallRoom.find({}).lean();
  for (const doc of docs) {
    const guild = client.guilds.cache.get(doc.guildId);
    const channel = guild?.channels.cache.get(doc.channelId);
    if (!channel) {
      await CallRoom.deleteOne({ channelId: doc.channelId }).catch(() => {});
      continue;
    }
    if (humansIn(channel).size === 0) {
      await deleteRoomChannel(channel);
      continue;
    }
    rooms.set(doc.channelId, { channelId: doc.channelId, guildId: doc.guildId, ownerId: doc.ownerId });
  }
}

module.exports = {
  onVoiceStateUpdate,
  sweepCalls,
  forgetRoom,
  getRoom,
  getRoomByOwner,
  humansIn,
  getProfile,
  updateProfile,
  isLocked,
  allowedMemberIds,
  blockedMemberIds,
  allowUser,
  denyUser,
  clearUser,
  unblockUser,
  setLocked,
  applyLock,
  transferOwnership,
};
