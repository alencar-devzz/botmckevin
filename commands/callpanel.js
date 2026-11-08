const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");
const { getCallHubConfig } = require("../utils/callHubStore");
const { getRoomByOwner } = require("../utils/callHub");
const { buildCallPanel, buildNotice } = require("../ui/callPanel");

const V2 = MessageFlags.IsComponentsV2;

async function warn(message, content) {
  const sent = await message.channel
    .send({ components: buildNotice(content), flags: V2, allowedMentions: { parse: [] } })
    .catch(() => null);
  setTimeout(() => sent?.delete().catch(() => {}), 6000);
}

// Envia o painel de gerenciamento de call no canal. A aparência é configurada em
// n!painel → Comunidade e interação → Calls temporárias → Painel da call.
module.exports = {
  name: "callpanel",
  aliases: ["gcall"],
  async execute(message) {
    const { guild, member } = message;
    const cfg = await getCallHubConfig(guild.id);

    const allowed =
      member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.roles.cache.hasAny(...ALL_STAFF_ROLE_IDS) ||
      (cfg.staffRoles.length > 0 && member.roles.cache.hasAny(...cfg.staffRoles)) ||
      Boolean(getRoomByOwner(guild.id, member.id));

    if (!allowed) return warn(message, "Só a equipe ou quem tem uma call pode enviar o painel.");

    await message.channel.send({
      components: buildCallPanel(cfg, guild),
      flags: V2,
      allowedMentions: { parse: [] },
    });
  },
};
