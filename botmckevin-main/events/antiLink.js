const { onMessage } = require("../utils/antiraid/antiLink");

// Anti-link: confere mensagens novas e também as editadas (editar para esconder o link não funciona).
// Erros nunca derrubam o bot nem os outros eventos.
const wrap = (event) => ({
  ...event,
  async execute(...args) {
    try {
      await event.execute(...args);
    } catch (err) {
      console.error(`[ANTILINK] Erro no evento "${event.name}":`, err);
    }
  },
});

module.exports = [
  { name: "messageCreate", execute: onMessage },
  {
    name: "messageUpdate",
    async execute(oldMessage, newMessage) {
      const message = newMessage.partial ? await newMessage.fetch().catch(() => null) : newMessage;
      if (!message?.guild) return;
      // só conteúdo que mudou (o Discord também dispara este evento ao carregar embeds)
      if (oldMessage.content != null && oldMessage.content === message.content) return;
      await onMessage(message);
    },
  },
].map(wrap);
