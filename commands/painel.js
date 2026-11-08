const { MessageFlags } = require("discord.js");
const { getCallHubConfig } = require("../utils/callHubStore");
const { getRoomByOwner } = require("../utils/callHub");
const { buildCallPanel, buildNotice } = require("../ui/callPanel");

const V2 = MessageFlags.IsComponentsV2;

async function warn(message, content) {
  const sent = await message.channel
    .send({ components: buildNotice(content), flags: V2, allowedMentions: { users: [message.author.id] } })
    .catch(() => null);
  setTimeout(() => sent?.delete().catch(() => {}), 8000);
}

// Envia o painel de gerenciamento de call no canal. A aparência é configurada em
// n!menu → Comunidade e interação → Calls temporárias → Painel da call.
// REGRA: só quem é DONO de uma call ativa pode usar (equipe e Administradores também não têm exceção).
module.exports = {
  name: "painel",
  async execute(message) {
    const { guild, member } = message;
    const cfg = await getCallHubConfig(guild.id);

    const room = getRoomByOwner(guild.id, member.id);
    if (!room || !guild.channels.cache.has(room.channelId)) {
      const where =
        cfg.triggerChannelId && guild.channels.cache.has(cfg.triggerChannelId)
          ? ` Entre em <#${cfg.triggerChannelId}> para criar a sua.`
          : "";
      return warn(message, `<@${member.id}>, você não tem uma call ativa. Crie uma para poder usar o painel.${where}`);
    }

    await message.channel.send({
      components: buildCallPanel(cfg, guild),
      flags: V2,
      allowedMentions: { parse: [] },
    });
  },
};
