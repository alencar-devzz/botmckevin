// Sessoes efêmeras do /dmmassa — guardadas em memória, expiram em 30 min sem uso.

const { randomBytes } = require("node:crypto");

const SESSION_TTL = 30 * 60 * 1000;
const sessions = new Map(); // sid -> state

function createDmMassaSession(userId) {
  const sid = randomBytes(6).toString("hex");
  const state = {
    sid,
    userId,
    // Fase: home | compose | servers | confirm | sending
    phase: "home",
    // Texto redigido no modal
    message: null,
    // Servidor selecionado no select
    guildId: null,
    guildName: null,
    // Quantidade de DMs a enviar (null = todas)
    limit: null,
    // Progresso do envio
    sent: 0,
    failed: 0,
    total: 0,
    skipped: 0, // membros sem DM aberta, pulados
    // Timestamp da ultima interação
    touch: Date.now(),
  };
  sessions.set(sid, state);
  return state;
}

function getDmMassaSession(sid) {
  const state = sessions.get(sid);
  if (!state) return null;
  if (Date.now() - state.touch > SESSION_TTL) {
    sessions.delete(sid);
    return null;
  }
  state.touch = Date.now();
  return state;
}

function deleteDmMassaSession(sid) {
  sessions.delete(sid);
}

module.exports = { createDmMassaSession, getDmMassaSession, deleteDmMassaSession };
