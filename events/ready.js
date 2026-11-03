const { ActivityType } = require("discord.js");
const { DEFAULT_PREFIX } = require("../utils/getPrefix");
const { getBotConfig, applyPresence } = require("../utils/botPresence");

module.exports = {
  name: "clientReady",
  once: true,
  async execute(client) {
    console.log(`[BOT] Online como ${client.user.tag}`);

    // Status salvo pelo menu (Aparência > Status). Sem nada salvo, usa o padrão abaixo.
    try {
      const cfg = await getBotConfig();
      if (cfg.presenceActivity) {
        await applyPresence(client, cfg);
        return;
      }
    } catch (err) {
      console.error("[BOT] Erro ao carregar o status salvo:", err.message);
    }

    // Padrão: online + transmissão (bolinha roxa). O link precisa ser do Twitch/YouTube.
    client.user.setPresence({
      status: "online",
      activities: [
        {
          name: `Prefixo: ${DEFAULT_PREFIX}`,
          type: ActivityType.Streaming,
          url: "https://www.twitch.tv/discord",
        },
      ],
    });
  },
};
