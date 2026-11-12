const { ActivityType } = require("discord.js");
const { DEFAULT_PREFIX } = require("../utils/getPrefix");
const { getBotConfig, applyPresence } = require("../utils/botPresence");
const { sweepCalls } = require("../utils/callHub");

// Servidor onde os slash commands são registrados (pode trocar pela variável GUILD_ID).
const GUILD_ID = process.env.GUILD_ID || "1542321888175456357";

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

    // Registra os slash commands direto no servidor (aparecem na hora).
    // Os aliases apontam para o mesmo comando, então o Set remove as repetições.
    try {
      const slashCommands = [...new Set(client.commands.values())]
        .filter((command) => command.data)
        .map((command) => command.data.toJSON());

      const guild =
        client.guilds.cache.get(GUILD_ID) ?? (await client.guilds.fetch(GUILD_ID));
      await guild.commands.set(slashCommands);
      console.log(`[SLASH] ${slashCommands.length} comandos registrados em ${guild.name}.`);

      // Limpa os comandos globais antigos para não aparecerem duplicados.
      await client.application.commands.set([]);
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
