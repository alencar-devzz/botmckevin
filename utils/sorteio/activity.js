const SorteioActivity = require("../../database/models/SorteioActivity");

// Contadores usados pelos requisitos do /sorteio: mensagens, tempo em call e convites.
// As mensagens e o tempo em call são gravados em lotes para não pesar no banco.

const msgBuffer = new Map(); // "guildId:userId" -> mensagens ainda não gravadas
const voiceBuffer = new Map(); // "guildId:userId" -> ms ainda não gravados
const sessions = new Map(); // "guildId:userId" -> início da sessão de voz (ms)

const keyOf = (guildId, userId) => `${guildId}:${userId}`;

function trackMessage(guildId, userId) {
  const key = keyOf(guildId, userId);
  msgBuffer.set(key, (msgBuffer.get(key) ?? 0) + 1);
}

function closeSession(guildId, userId) {
  const key = keyOf(guildId, userId);
  const start = sessions.get(key);
  if (start === undefined) return;
  sessions.delete(key);
  const spent = Date.now() - start;
  if (spent > 0) voiceBuffer.set(key, (voiceBuffer.get(key) ?? 0) + spent);
}

function openSession(guildId, userId) {
  const key = keyOf(guildId, userId);
  if (!sessions.has(key)) sessions.set(key, Date.now());
}

function onVoiceState(oldState, newState) {
  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return;
  const guildId = newState.guild.id;
  if (!newState.channelId) return closeSession(guildId, member.id);
  openSession(guildId, member.id);
}

// Ao ligar o bot, quem já está em call começa a contar dali
function seedVoice(client) {
  for (const guild of client.guilds.cache.values()) {
    for (const state of guild.voiceStates.cache.values()) {
      if (state.channelId && state.member && !state.member.user.bot) openSession(guild.id, state.id);
    }
  }
}

const splitKey = (key) => {
  const i = key.indexOf(":");
  return [key.slice(0, i), key.slice(i + 1)];
};

async function flush() {
  const ops = new Map(); // key -> $inc
  for (const [key, n] of msgBuffer) ops.set(key, { messages: n });
  msgBuffer.clear();

  // a sessão aberta também é gravada, e o relógio dela recomeça
  const now = Date.now();
  for (const [key, start] of sessions) {
    const spent = now - start;
    if (spent > 0) voiceBuffer.set(key, (voiceBuffer.get(key) ?? 0) + spent);
    sessions.set(key, now);
  }
  for (const [key, ms] of voiceBuffer) ops.set(key, { ...(ops.get(key) ?? {}), voiceMs: ms });
  voiceBuffer.clear();

  if (!ops.size) return;
  const writes = [...ops].map(([key, inc]) => {
    const [guildId, userId] = splitKey(key);
    return { updateOne: { filter: { guildId, userId }, update: { $inc: inc }, upsert: true } };
  });
  await SorteioActivity.bulkWrite(writes, { ordered: false });
}

async function addInvites(guildId, userId, amount = 1) {
  await SorteioActivity.updateOne({ guildId, userId }, { $inc: { invites: amount } }, { upsert: true });
}

// Totais da pessoa (já somando o que está no buffer e a sessão de call em andamento)
async function getActivity(guildId, userId) {
  const key = keyOf(guildId, userId);
  const doc = await SorteioActivity.findOne({ guildId, userId }).lean();
  const live = sessions.has(key) ? Date.now() - sessions.get(key) : 0;
  return {
    messages: (doc?.messages ?? 0) + (msgBuffer.get(key) ?? 0),
    voiceMin: Math.floor(((doc?.voiceMs ?? 0) + (voiceBuffer.get(key) ?? 0) + live) / 60000),
    invites: doc?.invites ?? 0,
  };
}

module.exports = { trackMessage, onVoiceState, seedVoice, flush, addInvites, getActivity };
