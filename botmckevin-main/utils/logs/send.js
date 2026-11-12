const { MessageFlags } = require("discord.js");
const { getCategory } = require("./store");
const { buildLogComponents } = require("./render");

// Retorna a configuração da categoria se ela puder enviar logs agora; senão null
async function activeCategory(guild, key, isBot = false) {
  if (!guild) return null;
  const cfg = await getCategory(guild.id, key);
  if (!cfg.enabled || !cfg.channelId) return null;
  if (isBot && cfg.ignoreBots) return null;
  return cfg;
}

async function deliver(guild, cfg, spec) {
  const channel =
    guild.channels.cache.get(cfg.channelId) ??
    (await guild.channels.fetch(cfg.channelId).catch(() => null));
  if (!channel?.isTextBased?.()) return false;

  try {
    await channel.send({
      components: buildLogComponents(spec),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] }, // as menções aparecem, mas ninguém é notificado
    });
    return true;
  } catch (err) {
    console.error(`[LOGS] Não consegui enviar no canal ${cfg.channelId}:`, err.message);
    return false;
  }
}

module.exports = { activeCategory, deliver };
