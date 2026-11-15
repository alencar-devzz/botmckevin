const crypto = require("crypto");

// Estado do painel /duplicar-categoria. Cada vez que o comando é usado nasce uma sessão (id curto no customId
// dos componentes). Ela some depois de um tempo sem uso.
const TTL_MS = 30 * 60 * 1000;
const sessions = new Map(); // sid -> state

const ALL_TYPES = ["text", "announcement", "voice", "stage", "forum", "media"];
const ALL_ITEMS = [
  "catPerms",
  "chanPerms",
  "topic",
  "slowmode",
  "nsfw",
  "voiceQuality",
  "voiceLimit",
  "voiceRegion",
  "forumTags",
  "forumDefaults",
  "forumFlags",
  "threadArchive",
  "threadSlowmode",
];

function freshOptions() {
  return {
    sourceId: null,
    newName: null,
    find: "", // trocar texto nos nomes dos canais
    replace: "",
    prefix: "", // texto antes/depois do nome de cada canal
    suffix: "",
    filterInclude: "", // só canais cujo nome contém isto
    filterExclude: "", // nunca canais cujo nome contém isto
    order: "original", // original | az
    position: "below", // below | above | top | end
    copies: 1,
    types: new Set(ALL_TYPES),
    items: new Set(ALL_ITEMS),
    excluded: new Set(), // canais da categoria que ficam de fora
    privateCopy: false, // esconde a cópia de @everyone
    accessRoles: [], // cargos que ganham acesso à cópia
    chPage: 0,
    result: null, // { created: [{ category, channels }], failures, notes }
  };
}

function sweep() {
  const now = Date.now();
  for (const [sid, state] of sessions) if (now - state.touched > TTL_MS) sessions.delete(sid);
}

function createSession(userId, guildId) {
  sweep();
  const sid = crypto.randomBytes(4).toString("hex");
  const state = { sid, userId, guildId, page: "home", busy: false, touched: Date.now(), ...freshOptions() };
  sessions.set(sid, state);
  return state;
}

function getSession(sid) {
  const state = sessions.get(sid);
  if (!state) return null;
  state.touched = Date.now();
  return state;
}

function deleteSession(sid) {
  sessions.delete(sid);
}

// "Duplicar outra": volta ao começo mantendo a mesma sessão
function resetSession(state) {
  Object.assign(state, freshOptions(), { page: "home", busy: false });
}

module.exports = { createSession, getSession, deleteSession, resetSession, ALL_TYPES, ALL_ITEMS };
