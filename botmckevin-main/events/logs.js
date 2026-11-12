// Registra todos os eventos do sistema de logs (utils/logs/*.js).
// O index.js carrega cada arquivo de /events e aceita uma lista de eventos por arquivo.
const messages = require("../utils/logs/messages");
const members = require("../utils/logs/members");
const moderation = require("../utils/logs/moderation");
const voice = require("../utils/logs/voice");
const channels = require("../utils/logs/channels");
const roles = require("../utils/logs/roles");

// Envolve cada evento para que um erro em um log nunca derrube o bot nem os outros eventos
const wrap = (event) => ({
  ...event,
  async execute(...args) {
    try {
      await event.execute(...args);
    } catch (err) {
      console.error(`[LOGS] Erro no evento "${event.name}":`, err);
    }
  },
});

module.exports = [
  ...messages,
  ...members,
  ...moderation,
  ...voice,
  ...channels,
  ...roles,
].map(wrap);
