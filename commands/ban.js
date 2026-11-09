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
  name: "ban",

  // /ban usuario:@pessoa motivo:texto
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Bane um membro do servidor.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) =>
      o.setName("usuario").setDescription("Quem será banido.").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("motivo").setDescription("Motivo do banimento.").setMaxLength(512)
    ),

  async executeSlash(interaction) {
    const permitido = await requirePermission(
      interaction,
      PermissionFlagsBits.BanMembers,
      "Você não tem permissão para banir membros."
    );
    if (!permitido) return;

    const user = interaction.options.getUser("usuario", true);
    const member = interaction.options.getMember("usuario");
    const reason = interaction.options.getString("motivo")?.trim() || null;

    const erro = validateTarget(interaction, { user, member, botCheck: "bannable" });
    if (erro) return replyEphemeral(interaction, erro);

    return sendConfirm(interaction, {
      action: "ban",
      title: `Banimento · ${user.tag ?? user.username}`,
      question: `Deseja realmente banir <@${user.id}> do servidor?`,
      user,
      member,
      reason,
    });
  },

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
      allowedMentions: { parse: [] },
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
