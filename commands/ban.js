const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { resolveTarget } = require("../utils/resolveTarget");
const { buildConfirmPanel } = require("../ui/moderation");
const { setPendingModeration } = require("../utils/pendingModeration");

module.exports = {
  name: "ban",
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      const aviso = await message.channel.send("Você não tem permissão para banir membros.");
      setTimeout(() => aviso.delete().catch(() => {}), 5000);
      return;
    }

    const { user, member, reason, error } = await resolveTarget(message, args);
    if (error) {
      const aviso = await message.channel.send(error);
      setTimeout(() => aviso.delete().catch(() => {}), 5000);
      return;
    }

    const mention = `<@${user.id}>`;
    const panelMsg = await message.channel.send({
      components: buildConfirmPanel({
        title: `Banimento · ${user.tag ?? user.username}`,
        question: `Deseja realmente banir ${mention} do servidor?`,
        reason,
      }),
      flags: MessageFlags.IsComponentsV2,
    });

    setPendingModeration(
      panelMsg.id,
      {
        action: "ban",
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
