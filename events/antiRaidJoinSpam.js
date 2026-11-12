const { onMemberAdd, resumeLockdowns } = require("../utils/antiraid/massJoin");
const { onMessage } = require("../utils/antiraid/spam");
const { resumePanics } = require("../utils/antiraid/panic");

// Entrada em massa e Anti-spam. Erros nunca derrubam o bot nem os outros eventos.
const wrap = (event) => ({
  ...event,
  async execute(...args) {
    try {
      await event.execute(...args);
    } catch (err) {
      console.error(`[ANTIRAID] Erro no evento "${event.name}":`, err);
    }
  },
});

module.exports = [
  { name: "guildMemberAdd", execute: onMemberAdd },
  { name: "messageCreate", execute: onMessage },
  {
    name: "clientReady",
    once: true,
    execute: async (client) => {
      await resumeLockdowns(client);
      await resumePanics(client);
    },
  },
].map(wrap);
