// Quando o canal é recriado, o ID muda. Para o bot não "perder" o canal, troca o ID antigo pelo novo
// nas configurações do servidor (canal de logs, bump, boas-vindas, calls, posts, anti-raid, cl, nnuke...).
// Só mexe em modelos de CONFIGURAÇÃO deste servidor; histórico (mensagens salvas, tickets) fica como está.

const MODEL_FILES = [
  "LogConfig",
  "GuildConfig",
  "BumpConfig",
  "ClConfig",
  "NukeConfig",
  "PostConfig",
  "CallHubConfig",
  "AntiRaidConfig",
  "RoleManageConfig",
];

const isPlain = (v) => v !== null && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype;

// Troca (em strings, listas e objetos, inclusive nas chaves) o ID antigo pelo novo
function replaceDeep(value, from, to) {
  if (typeof value === "string") return value === from ? { value: to, changed: true } : { value, changed: false };

  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((item) => {
      const r = replaceDeep(item, from, to);
      if (r.changed) changed = true;
      return r.value;
    });
    return { value: changed ? out : value, changed };
  }

  if (isPlain(value)) {
    let changed = false;
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      const r = replaceDeep(item, from, to);
      const newKey = key === from ? to : key;
      if (r.changed || newKey !== key) changed = true;
      out[newKey] = r.value;
    }
    return { value: changed ? out : value, changed };
  }

  return { value, changed: false }; // números, datas, ObjectId...
}

function loadModels() {
  const models = [];
  for (const name of MODEL_FILES) {
    try {
      models.push(require(`../../database/models/${name}`));
    } catch {
      // modelo inexistente nesta versão do bot: ignora
    }
  }
  return models;
}

async function migrateOne(Model, guildId, from, to) {
  const docs = await Model.collection.find({ guildId }).toArray();
  let updated = 0;

  for (const doc of docs) {
    const set = {};
    for (const [key, value] of Object.entries(doc)) {
      if (["_id", "guildId", "__v"].includes(key)) continue;
      const r = replaceDeep(value, from, to);
      if (r.changed) set[key] = r.value;
    }
    if (!Object.keys(set).length) continue;
    await Model.collection.updateOne({ _id: doc._id }, { $set: set });
    updated++;
  }
  return updated;
}

// Retorna quantas configurações foram atualizadas
async function migrateChannelId(guildId, oldId, newId) {
  const results = await Promise.allSettled(loadModels().map((Model) => migrateOne(Model, guildId, oldId, newId)));
  let total = 0;
  for (const r of results) {
    if (r.status === "fulfilled") total += r.value;
    else console.error("[NUKE] Erro ao atualizar o ID do canal:", r.reason?.message ?? r.reason);
  }
  return total;
}

module.exports = { migrateChannelId, replaceDeep };
