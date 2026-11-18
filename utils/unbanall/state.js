// Sessões do painel n!unbanall (uma por mensagem de painel) e controle do trabalho em andamento por servidor.

const IDLE_MS = 5 * 60_000; // o painel some sozinho depois de 5 minutos sem uso
const CONFIRM_MS = 60_000; // toda confirmação expira em 1 minuto
const BANS_CACHE_MS = 60_000; // a lista de banidos fica guardada por 1 minuto

const sessions = new Map(); // messageId -> sessão
const jobs = new Map(); // guildId -> trabalho em andamento (desbanimento em massa ou banimento em lote)

function createSession({ guild, authorId }) {
  return {
    guild,
    authorId,
    message: null,
    view: "home", // home | list | confirm | progress | done
    bans: null, // [{ id, username, globalName, tag, reason, avatar }]
    bansAt: 0,
    bansError: false,
    page: 1,
    query: "",
    notice: null, // aviso curto mostrado uma vez no topo do painel
    confirm: null,
    job: null,
    result: null,
    expiresAt: Date.now() + IDLE_MS,
    idleTimer: null,
  };
}

function attachMessage(session, message) {
  session.message = message;
  sessions.set(message.id, session);
  touch(session);
}

function getSession(messageId) {
  return sessions.get(messageId) ?? null;
}

// Renova o prazo de inatividade (não expira enquanto houver um trabalho rodando)
function touch(session) {
  clearTimeout(session.idleTimer);
  session.expiresAt = Date.now() + IDLE_MS;
  session.idleTimer = setTimeout(() => {
    if (session.job && !session.job.finished) return touch(session);
    closeSession(session);
  }, IDLE_MS);
}

function closeSession(session) {
  clearTimeout(session.idleTimer);
  if (session.confirm?.timer) clearTimeout(session.confirm.timer);
  if (session.message) {
    sessions.delete(session.message.id);
    session.message.delete().catch(() => {});
  }
}

module.exports = {
  IDLE_MS,
  CONFIRM_MS,
  BANS_CACHE_MS,
  sessions,
  jobs,
  createSession,
  attachMessage,
  getSession,
  touch,
  closeSession,
};
