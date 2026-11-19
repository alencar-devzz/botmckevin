const { OverwriteType, PermissionFlagsBits: P, PermissionsBitField } = require("discord.js");
const CallRoom = require("../database/models/CallRoom");
const CallOwner = require("../database/models/CallOwner");
const CallProfile = require("../database/models/CallProfile");

// Gerenciador de calls: quem está em QUALQUER call de voz do servidor gerencia ela pelo painel.
// Não existe mais dono nem criação automática de call. Este arquivo só tem as ações sobre o canal.

const humansIn = (channel) => channel.members.filter((m) => !m.user.bot);

// ======================= Posse da call =======================
// Por padrão quem está na call é o dono dela. Depois de um "Transferir", a posse fica com a pessoa escolhida
// (guardada no MongoDB, coleção CallOwner, e em memória) enquanto ela continuar na call;
// se ela sair, a posse volta a ser de quem está na call.
const owners = new Map(); // channelId -> userId

function getOwner(channel) {
  const id = owners.get(channel.id);
  if (id && channel.members.has(id)) return id;
  if (id) forgetOwner(channel.id);
  return null;
}

async function setOwner(channel, userId) {
  owners.set(channel.id, userId);
  await CallOwner.updateOne(
    { channelId: channel.id },
    { $set: { guildId: channel.guild.id, ownerId: userId, updatedAt: new Date() } },
    { upsert: true }
  ).catch((err) => console.error("[CALLS] Não consegui salvar o dono da call:", err.message));
}

function forgetOwner(channelId) {
  owners.delete(channelId);
  CallOwner.deleteOne({ channelId }).catch(() => {});
}

// Ao ligar o bot: recarrega os donos salvos. Registro de call que não existe mais, ou cujo dono já saiu, é apagado.
async function loadOwners(client) {
  const docs = await CallOwner.find({}).lean();
  for (const doc of docs) {
    const channel = client.guilds.cache.get(doc.guildId)?.channels.cache.get(doc.channelId);
    if (channel?.members?.has(doc.ownerId)) owners.set(doc.channelId, doc.ownerId);
    else await CallOwner.deleteOne({ channelId: doc.channelId }).catch(() => {});
  }
}

// ======================= Perfil pessoal (Salvar Config / Usar Config) =======================

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

// Quem tem entrada liberada (fora a pessoa em exceptId, normalmente quem está usando o painel)
const allowedMemberIds = (channel, exceptId = null) =>
  memberOverwrites(channel)
    .filter((o) => o.allow.has(P.Connect) && o.id !== exceptId)
    .map((o) => o.id);

const blockedMemberIds = (channel) =>
  memberOverwrites(channel)
    .filter((o) => o.deny.has(P.Connect))
    .map((o) => o.id);

async function fetchUser(client, id) {
  return client.users.cache.get(id) ?? (await client.users.fetch(id).catch(() => null));
}

// Tira só as permissões indicadas. Se o overwrite ficar vazio ele é apagado, senão as outras
// permissões que o canal já tinha (definidas por outra pessoa ou pela moderação) continuam como estavam.
async function stripOverwrite(channel, id, allowFlags, denyFlags) {
  const overwrite = channel.permissionOverwrites.cache.get(id);
  if (!overwrite) return;

  const allow = new PermissionsBitField(overwrite.allow).remove(allowFlags.map((f) => P[f]));
  const deny = new PermissionsBitField(overwrite.deny).remove(denyFlags.map((f) => P[f]));
  if (allow.bitfield === 0n && deny.bitfield === 0n) {
    await overwrite.delete().catch(() => {});
    return;
  }

  const patch = {};
  for (const flag of [...allowFlags, ...denyFlags]) patch[flag] = null;
  await overwrite.edit(patch).catch(() => {});
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
  if (!overwrite || overwrite.deny.has(P.Connect) || !overwrite.allow.has(P.Connect)) return false;
  await stripOverwrite(channel, userId, ["Connect", "ViewChannel"], []);
  return true;
}

// Libera de novo uma pessoa bloqueada (remove o bloqueio de entrada)
async function unblockUser(channel, userId) {
  const overwrite = channel.permissionOverwrites.cache.get(userId);
  if (!overwrite || !overwrite.deny.has(P.Connect)) return false;
  await stripOverwrite(channel, userId, [], ["Connect"]);
  return true;
}

async function setLocked(channel, locked) {
  await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { Connect: locked ? false : null });
}

// Privar: fecha a call e deixa entrar só quem usou o painel (actorId) + as pessoas escolhidas
async function applyLock(channel, actorId, selectedIds) {
  await setLocked(channel, true);
  await allowUser(channel, actorId);

  const keep = new Set([actorId, ...selectedIds]);
  for (const id of allowedMemberIds(channel, actorId)) {
    if (!keep.has(id)) await clearUser(channel, id);
  }
  for (const id of selectedIds) {
    if (id !== actorId) await allowUser(channel, id);
  }
}

// ======================= Limpeza do sistema antigo =======================

// Ao ligar o bot: o sistema antigo criava calls temporárias. Aquelas que ficaram vazias são apagadas uma última vez;
// as que ainda têm gente viram calls comuns. Depois disso os registros antigos somem do banco.
async function sweepCalls(client) {
  const docs = await CallRoom.find({}).lean();
  for (const doc of docs) {
    const channel = client.guilds.cache.get(doc.guildId)?.channels.cache.get(doc.channelId);
    if (channel && humansIn(channel).size === 0) {
      await channel.delete("Call temporária antiga (sistema substituído pelo gerenciador de calls)").catch(() => {});
    }
  }
  if (docs.length) await CallRoom.deleteMany({ channelId: { $in: docs.map((d) => d.channelId) } }).catch(() => {});

  await loadOwners(client);
}

module.exports = {
  sweepCalls,
  humansIn,
  getOwner,
  setOwner,
  forgetOwner,
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
};
