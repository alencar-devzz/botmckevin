const { onBotJoin } = require("../utils/antiraid/antiBot");
const { onAltJoin, resumeUnbans } = require("../utils/antiraid/antiAlt");

// Anti-bot e Anti-alt. Erros nunca derrubam o bot nem os outros eventos.
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
  { name: "guildMemberAdd", execute: onBotJoin },
  { name: "guildMemberAdd", execute: onAltJoin },
  { name: "clientReady", once: true, execute: (client) => resumeUnbans(client) },
].map(wrap);
