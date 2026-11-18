const { ActivityType } = require("discord.js");
const { DEFAULT_PREFIX } = require("../utils/getPrefix");
const { getBotConfig, applyPresence } = require("../utils/botPresence");
const { sweepCalls } = require("../utils/callHub");
const { startCallKeeper } = require("../utils/callKeeper");
const { restoreCardTimers } = require("../utils/spotify/autoDelete");
const { getSpotifyConfig } = require("../utils/spotify/store");
const { prefetchCardImages } = require("../utils/spotify/card");

// Servidor onde os slash commands são registrados (pode trocar pela variável GUILD_ID).
const GUILD_ID = process.env.GUILD_ID || "1542321888175456357";

module.exports = {
  name: "clientReady",
  once: true,
  async execute(client) {
    console.log(`[BOT] Online como ${client.user.tag}`);

    // n!botcall: volta para a call salva no MongoDB e passa a mantê-la.
    // Sem isso o bot saía da call a cada reinício e nunca voltava.
    try {
      await startCallKeeper(client);
    } catch (err) {
      console.error("[BOTCALL] Erro ao iniciar o sistema de call:", err.message);
    }

    // Calls temporárias: apaga as que ficaram vazias enquanto o bot estava off e recarrega as ativas
    try {
      await sweepCalls(client);
    } catch (err) {
      console.error("[CALLS] Erro ao verificar as calls ao iniciar:", err.message);
    }

    // n!spotify: retoma a exclusão automática dos cards que ainda estavam agendados
    try {
      await restoreCardTimers(client);
    } catch (err) {
      console.error("[SPOTIFY] Erro ao retomar as exclusões automáticas:", err.message);
    }

    // n!spotify: já baixa o ícone da pílula de cada servidor (o primeiro card depois do reinício não espera por isso)
    for (const guild of client.guilds.cache.values()) {
      getSpotifyConfig(guild.id)
        .then((cfg) => prefetchCardImages({}, cfg))
        .catch(() => {});
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
