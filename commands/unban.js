const {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  InteractionContextType,
} = require("discord.js");
const { resolveTarget } = require("../utils/resolveTarget");
const { buildConfirmPanel } = require("../ui/moderation");
const { setPendingModeration } = require("../utils/pendingModeration");
const { replyEphemeral, requirePermission, sendConfirm } = require("../utils/slashModeration");

module.exports = {
  name: "unban",

  // /unban usuario:@pessoa (ou o ID de quem está banido) motivo:texto
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Remove o banimento de um usuário.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) =>
      o
        .setName("usuario")
        .setDescription("Quem será desbanido (cole o ID se a pessoa não aparecer).")
        .setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("motivo").setDescription("Motivo do desbanimento.").setMaxLength(512)
    ),

  async executeSlash(interaction) {
    const permitido = await requirePermission(
      interaction,
      PermissionFlagsBits.BanMembers,
      "Você não tem permissão para desbanir membros."
    );
    if (!permitido) return;

    const user = interaction.options.getUser("usuario", true);
    const reason = interaction.options.getString("motivo")?.trim() || null;

    const banEntry = await interaction.guild.bans.fetch(user.id).catch(() => null);
    if (!banEntry) {
      return replyEphemeral(interaction, "Esse usuário não está banido.");
    }

    return sendConfirm(interaction, {
      action: "unban",
      title: `Unban · ${user.tag ?? user.username}`,
      question: `Deseja realmente desbanir <@${user.id}> do servidor?`,
      user,
      member: null,
      reason,
    });
  },

  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      const aviso = await message.channel.send("Você não tem permissão para desbanir membros.");
      setTimeout(() => aviso.delete().catch(() => {}), 5000);
      return;
    }

    const { user, reason, error } = await resolveTarget(message, args);
    if (error) {
      const aviso = await message.channel.send(error);
      setTimeout(() => aviso.delete().catch(() => {}), 5000);
      return;
    }

    const banEntry = await message.guild.bans.fetch(user.id).catch(() => null);
    if (!banEntry) {
      const aviso = await message.channel.send("Esse usuário não está banido.");
      setTimeout(() => aviso.delete().catch(() => {}), 5000);
      return;
    }

    const mention = `<@${user.id}>`;
    const panelMsg = await message.channel.send({
      components: buildConfirmPanel({
        title: `Unban · ${user.tag ?? user.username}`,
        question: `Deseja realmente desbanir ${mention} do servidor?`,
        reason,
      }),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });

    setPendingModeration(
      panelMsg.id,
      {
        action: "unban",
        targetId: user.id,
        targetTag: user.tag ?? user.username,
        reason,
        guild: message.guild,
        message: panelMsg,
        authorId: message.author.id,
      },
      60000
    );
  },
};
