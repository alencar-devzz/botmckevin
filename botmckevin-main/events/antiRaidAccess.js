const { runGate } = require("../utils/antiraid/joinGate");
const { resumeUnbans } = require("../utils/antiraid/antiAlt");

// Anti-bot e Anti-alt decidem pelo portão de entrada (uma vez por membro). A Portaria espera essa
// decisão antes de dar cargos e boas-vindas. Erros nunca derrubam o bot nem os outros eventos.
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
  { name: "guildMemberAdd", execute: (member) => runGate(member) },
  { name: "clientReady", once: true, execute: (client) => resumeUnbans(client) },
].map(wrap);
