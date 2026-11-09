const { ActivityType } = require("discord.js");
const { DEFAULT_PREFIX } = require("../utils/getPrefix");
const { getBotConfig, applyPresence } = require("../utils/botPresence");
const { sweepCalls } = require("../utils/callHub");

module.exports = {
  name: "clientReady",
  once: true,
  async execute(client) {
    console.log(`[BOT] Online como ${client.user.tag}`);

    // Calls temporárias: apaga as que ficaram vazias enquanto o bot estava off e recarrega as ativas
    try {
      await sweepCalls(client);
    } catch (err) {
      console.error("[CALLS] Erro ao verificar as calls ao iniciar:", err.message);
    }

    // Registra os slash commands (os comandos que exportam "data").
    // Os aliases apontam para o mesmo comando, então o Set remove as repetições.
    try {
      const slashCommands = [...new Set(client.commands.values())]
        .filter((command) => command.data)
        .map((command) => command.data.toJSON());
      await client.application.commands.set(slashCommands);
      console.log(`[SLASH] ${slashCommands.length} comandos registrados.`);
    } catch (err) {
      console.error("[SLASH] Erro ao registrar os comandos:", err.message);
    }

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
