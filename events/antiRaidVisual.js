const { onGuildUpdate } = require("../utils/antiraid/visual");

// Visual do servidor. Erros nunca derrubam o bot.
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

module.exports = [{ name: "guildUpdate", execute: onGuildUpdate }].map(wrap);
