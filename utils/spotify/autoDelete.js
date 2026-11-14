const SpotifyCardTimer = require("../../database/models/SpotifyCardTimer");

const timers = new Map(); // messageId -> timeout

async function removeCard(client, { guildId, channelId, messageId }) {
  timers.delete(messageId);
  try {
    const channel = client.channels.cache.get(channelId) ?? (await client.channels.fetch(channelId).catch(() => null));
    await channel?.messages?.delete(messageId).catch(() => {});
  } finally {
    await SpotifyCardTimer.deleteOne({ messageId }).catch(() => {});
  }
}

function arm(client, data, delayMs) {
  // setTimeout não aceita atraso maior que ~24,8 dias; o painel limita a 24h, então cabe com folga
  const timeout = setTimeout(() => removeCard(client, data), Math.max(0, delayMs));
  timeout.unref?.();
  timers.set(data.messageId, timeout);
}

// Agenda a exclusão de um card (minutos). 0 = não agenda.
async function scheduleCardDelete(client, message, minutes) {
  if (!minutes || !message?.guildId) return;
  const data = { guildId: message.guildId, channelId: message.channelId, messageId: message.id };
  const deleteAt = new Date(Date.now() + minutes * 60_000);
  await SpotifyCardTimer.updateOne({ messageId: data.messageId }, { $set: { ...data, deleteAt } }, { upsert: true }).catch(
    (err) => console.error("[SPOTIFY] Erro ao salvar a exclusão automática:", err.message)
  );
  arm(client, data, minutes * 60_000);
}

// Ao ligar o bot: retoma os cards que ainda estavam agendados (apaga já os que venceram)
async function restoreCardTimers(client) {
  const pending = await SpotifyCardTimer.find({}).lean();
  for (const doc of pending) {
    arm(client, doc, new Date(doc.deleteAt).getTime() - Date.now());
  }
  if (pending.length) console.log(`[SPOTIFY] ${pending.length} card(s) com exclusão automática retomado(s).`);
}

module.exports = { scheduleCardDelete, restoreCardTimers };
