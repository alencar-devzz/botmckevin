const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");
const { getCallHubConfig } = require("../utils/callHubStore");
const { buildCallPanel, buildNotice } = require("../ui/callPanel");
const { say } = require("../utils/callHubMessages");

const V2 = MessageFlags.IsComponentsV2;

async function warn(message, content) {
  const sent = await message.channel
    .send({ components: buildNotice(content), flags: V2, allowedMentions: { users: [message.author.id] } })
    .catch(() => null);
  setTimeout(() => sent?.delete().catch(() => {}), 8000);
}

// Envia o painel de gerenciamento de call como painel fixo no canal.
// QUEM ENVIA: só a moderação (Administrador, cargos da equipe ou cargos de staff configurados nas calls).
// QUEM USA OS BOTÕES: só o dono de uma call (ver requireRoom em handlers/callHubHandlers.js).
// A aparência é configurada em n!menu → Comunidade e interação → Calls temporárias → Painel da call.
module.exports = {
  name: "painel",
  async execute(message) {
    const { guild, member } = message;
    const cfg = await getCallHubConfig(guild.id);

    const isModerator =
      member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.roles.cache.hasAny(...ALL_STAFF_ROLE_IDS) ||
      (cfg.staffRoles.length > 0 && member.roles.cache.hasAny(...cfg.staffRoles));

    if (!isModerator) return warn(message, say(cfg, "cmdNotMod", { usuario: `<@${member.id}>` }));

    await message.channel.send({
      components: buildCallPanel(cfg, guild),
      flags: V2,
      allowedMentions: { parse: [] },
    });
  },
};
