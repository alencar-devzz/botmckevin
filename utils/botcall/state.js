const CallState = require("../../database/models/CallState");

// Persistência do sistema de call no MongoDB.
// As escritas de um mesmo servidor acontecem em fila, na ordem em que foram pedidas.
const queues = new Map(); // guildId -> promise da última escrita

function enqueue(guildId, task) {
  const previous = queues.get(guildId) ?? Promise.resolve();
  const run = previous.then(task);
  queues.set(guildId, run.catch(() => {}));
  return run;
}

// Salva campos do estado. Nunca lança erro: devolve true/false.
async function save(guildId, fields) {
  try {
    await enqueue(guildId, () =>
      CallState.findOneAndUpdate({ guildId }, { $set: fields }, { upsert: true, setDefaultsOnInsert: true })
    );
    return true;
  } catch (err) {
    console.error("[BOTCALL] Erro ao salvar no MongoDB:", err.message);
    return false;
  }
}

const isRef = (ref) => Boolean(ref?.channelId && ref?.messageId);

// Carrega todos os estados salvos (já migrando o painel único da versão antiga para a lista "panels")
async function loadAll() {
  const docs = await CallState.find({}).lean();
  const states = [];

  for (const doc of docs) {
    const panels = (doc.panels ?? []).filter(isRef).map(({ channelId, messageId }) => ({ channelId, messageId }));

    const hasLegacy = Boolean(doc.panelChannelId || doc.panelMessageId);
    if (hasLegacy) {
      if (doc.panelChannelId && doc.panelMessageId && !panels.some((p) => p.messageId === doc.panelMessageId)) {
        panels.push({ channelId: doc.panelChannelId, messageId: doc.panelMessageId });
      }
      await CallState.updateOne(
        { guildId: doc.guildId },
        { $set: { panels }, $unset: { panelChannelId: "", panelMessageId: "" } }
      ).catch((err) => console.error("[BOTCALL] Erro ao migrar o painel antigo:", err.message));
    }

    states.push({
      guildId: doc.guildId,
      channelId: doc.channelId ?? null,
      active: Boolean(doc.active),
      stopReason: doc.stopReason ?? null,
      panels,
    });
  }

  return states;
}

module.exports = { save, loadAll };
