const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { resolveTarget } = require("../utils/resolveTarget");
const { buildConfirmPanel } = require("../ui/moderation");
const { setPendingModeration } = require("../utils/pendingModeration");

module.exports = {
  name: "kick",
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      const aviso = await message.channel.send("Você não tem permissão para expulsar membros.");
      setTimeout(() => aviso.delete().catch(() => {}), 5000);
      return;
    }

    const { user, member, reason, error } = await resolveTarget(message, args);
    if (error) {
      const aviso = await message.channel.send(error);
      setTimeout(() => aviso.delete().catch(() => {}), 5000);
      return;
    }

    if (!member) {
      const aviso = await message.channel.send("Esse usuário não está neste servidor.");
      setTimeout(() => aviso.delete().catch(() => {}), 5000);
      return;
    }

    const mention = `<@${user.id}>`;
    const panelMsg = await message.channel.send({
      components: buildConfirmPanel({
        title: `Expulsão · ${user.tag ?? user.username}`,
        question: `Deseja realmente expulsar ${mention} do servidor?`,
        reason,
      }),
      flags: MessageFlags.IsComponentsV2,
    });

    setPendingModeration(
      panelMsg.id,
      {
        action: "kick",
        targetId: user.id,
        targetTag: user.tag ?? user.username,
        reason,
        guild: message.guild,
        member,
        message: panelMsg,
        authorId: message.author.id,
      },
      60000
    );
  },
};
