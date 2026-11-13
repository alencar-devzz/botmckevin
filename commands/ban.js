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
  // /ban id:123456789012345678 motivo:texto  (para quem já saiu do servidor)
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Bane um membro do servidor.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) =>
      o.setName("usuario").setDescription("Quem será banido (membro do servidor).")
    )
    .addStringOption((o) =>
      o
        .setName("id")
        .setDescription("ID de quem será banido (serve para quem já saiu do servidor).")
        .setMaxLength(32)
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

    const picked = interaction.options.getUser("usuario");
    const idText = interaction.options.getString("id")?.match(/\d{17,20}/)?.[0] ?? null;
    const reason = interaction.options.getString("motivo")?.trim() || null;

    if (!picked && !idText) {
      return replyEphemeral(interaction, "Escolha alguém em usuario ou informe o ID em id.");
    }

    // Pelo ID dá para banir quem não está mais no servidor
    const user = picked ?? (await interaction.client.users.fetch(idText).catch(() => null));
    if (!user) return replyEphemeral(interaction, "Não encontrei nenhum usuário com esse ID.");

    const member = picked
      ? interaction.options.getMember("usuario")
      : await interaction.guild.members.fetch(user.id).catch(() => null);

    const erro = validateTarget(interaction, { user, member, botCheck: "bannable" });
    if (erro) return replyEphemeral(interaction, erro);

    const jaBanido = await interaction.guild.bans.fetch(user.id).catch(() => null);
    if (jaBanido) return replyEphemeral(interaction, "Esse usuário já está banido.");

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

    const jaBanido = await message.guild.bans.fetch(user.id).catch(() => null);
    if (jaBanido) {
      const aviso = await message.channel.send("Esse usuário já está banido.");
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
