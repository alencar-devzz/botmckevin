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
  name: "unmute",

  // /unmute usuario:@pessoa motivo:texto
  data: new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Remove o mute de um membro.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) =>
      o.setName("usuario").setDescription("Quem será desmutado.").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("motivo").setDescription("Motivo do desmute.").setMaxLength(512)
    ),

  async executeSlash(interaction) {
    const permitido = await requirePermission(
      interaction,
      PermissionFlagsBits.ModerateMembers,
      "Você não tem permissão para desmutar membros."
    );
    if (!permitido) return;

    const user = interaction.options.getUser("usuario", true);
    const member = interaction.options.getMember("usuario");
    const reason = interaction.options.getString("motivo")?.trim() || null;

    const erro = validateTarget(interaction, {
      user,
      member,
      requireMember: true,
      botCheck: "moderatable",
    });
    if (erro) return replyEphemeral(interaction, erro);

    const estaMutado =
      member.communicationDisabledUntilTimestamp &&
      member.communicationDisabledUntilTimestamp > Date.now();

    if (!estaMutado) {
      return replyEphemeral(interaction, "Esse usuário não está mutado.");
    }

    return sendConfirm(interaction, {
      action: "unmute",
      title: `Unmute · ${user.tag ?? user.username}`,
      question: `Deseja realmente desmutar <@${user.id}>?`,
      user,
      member,
      reason,
    });
  },

  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      const aviso = await message.channel.send("Você não tem permissão para desmutar membros.");
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

    const estaMutado =
      member.communicationDisabledUntilTimestamp &&
      member.communicationDisabledUntilTimestamp > Date.now();

    if (!estaMutado) {
      const aviso = await message.channel.send("Esse usuário não está mutado.");
      setTimeout(() => aviso.delete().catch(() => {}), 5000);
      return;
    }

    const mention = `<@${user.id}>`;
    const avatarUrl = user.displayAvatarURL({ extension: "png", size: 256 });
    const panelMsg = await message.channel.send({
      components: buildConfirmPanel({
        title: `Unmute · ${user.tag ?? user.username}`,
        question: `Deseja realmente desmutar ${mention}?`,
        reason,
        avatarUrl,
      }),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });

    setPendingModeration(
      panelMsg.id,
      {
        action: "unmute",
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
