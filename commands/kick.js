const {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  InteractionContextType,
} = require("discord.js");
const { resolveTarget } = require("../utils/resolveTarget");
const { buildConfirmPanel } = require("../ui/moderation");
const { setPendingModeration } = require("../utils/pendingModeration");
const {
  replyEphemeral,
  requirePermission,
  validateTarget,
  sendConfirm,
} = require("../utils/slashModeration");

module.exports = {
  name: "kick",

  // /kick usuario:@pessoa motivo:texto
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Expulsa um membro do servidor.")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) =>
      o.setName("usuario").setDescription("Quem será expulso.").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("motivo").setDescription("Motivo da expulsão.").setMaxLength(512)
    ),

  async executeSlash(interaction) {
    const permitido = await requirePermission(
      interaction,
      PermissionFlagsBits.KickMembers,
      "Você não tem permissão para expulsar membros."
    );
    if (!permitido) return;

    const user = interaction.options.getUser("usuario", true);
    const member = interaction.options.getMember("usuario");
    const reason = interaction.options.getString("motivo")?.trim() || null;

    const erro = validateTarget(interaction, {
      user,
      member,
      requireMember: true,
      botCheck: "kickable",
    });
    if (erro) return replyEphemeral(interaction, erro);

    return sendConfirm(interaction, {
      action: "kick",
      title: `Expulsão · ${user.tag ?? user.username}`,
      question: `Deseja realmente expulsar <@${user.id}> do servidor?`,
      user,
      member,
      reason,
    });
  },

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
    const avatarUrl = user.displayAvatarURL({ extension: "png", size: 256 });
    const panelMsg = await message.channel.send({
      components: buildConfirmPanel({
        title: `Expulsão · ${user.tag ?? user.username}`,
        question: `Deseja realmente expulsar ${mention} do servidor?`,
        reason,
        avatarUrl,
      }),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
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
        avatarUrl,
        message: panelMsg,
        authorId: message.author.id,
      },
      60000
    );
  },
};
