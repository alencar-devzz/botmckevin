const {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  InteractionContextType,
} = require("discord.js");
const { resolveTarget } = require("../utils/resolveTarget");
const { buildConfirmPanel } = require("../ui/moderation");
const { setPendingModeration } = require("../utils/pendingModeration");
const { extractDuration } = require("../utils/parseDuration");
const { formatDuration } = require("../utils/formatDuration");
const {
  replyEphemeral,
  requirePermission,
  validateTarget,
  sendConfirm,
} = require("../utils/slashModeration");

// Duração padrão usada quando a pessoa não informa um tempo no comando.
// Ex: n!mute @user 10m motivo   |   n!mute @user 2h   |   n!mute @user motivo (usa o padrão abaixo)
// Slash: /mute usuario:@user tempo:10m motivo:texto
// Tempos aceitos: s (segundos), m (minutos), h (horas), d (dias), w (semanas).
// O máximo é limitado automaticamente a 28 dias, que é o teto da API do Discord.
const DEFAULT_MUTE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 horas

module.exports = {
  name: "mute",

  data: new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Muta um membro por um tempo (timeout).")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) =>
      o.setName("usuario").setDescription("Quem será mutado.").setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("tempo")
        .setDescription("Duração: 10s, 5m, 2h, 1d ou 1w. Sem tempo, usa 24 horas.")
        .setMaxLength(10)
    )
    .addStringOption((o) =>
      o.setName("motivo").setDescription("Motivo do mute.").setMaxLength(512)
    ),

  async executeSlash(interaction) {
    const permitido = await requirePermission(
      interaction,
      PermissionFlagsBits.ModerateMembers,
      "Você não tem permissão para mutar membros."
    );
    if (!permitido) return;

    const user = interaction.options.getUser("usuario", true);
    const member = interaction.options.getMember("usuario");
    const tempoTexto = interaction.options.getString("tempo")?.trim();
    const reason = interaction.options.getString("motivo")?.trim() || null;

    let duration = DEFAULT_MUTE_DURATION_MS;
    if (tempoTexto) {
      const { duration: informado } = extractDuration([tempoTexto]);
      if (!informado) {
        return replyEphemeral(
          interaction,
          "Tempo inválido. Use um número seguido de s, m, h, d ou w. Exemplos: 30m, 2h, 1d."
        );
      }
      duration = informado;
    }

    const erro = validateTarget(interaction, {
      user,
      member,
      requireMember: true,
      botCheck: "moderatable",
    });
    if (erro) return replyEphemeral(interaction, erro);

    return sendConfirm(interaction, {
      action: "mute",
      title: `Mute · ${user.tag ?? user.username}`,
      question: `Deseja realmente mutar <@${user.id}> por ${formatDuration(duration)}?`,
      user,
      member,
      reason,
      duration,
    });
  },

  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      const aviso = await message.channel.send("Você não tem permissão para mutar membros.");
      setTimeout(() => aviso.delete().catch(() => {}), 5000);
      return;
    }

    // Procura um tempo (ex: 10m, 2h, 1d) em qualquer posição do comando
    const { duration: tempoInformado, args: argsSemTempo } = extractDuration(args);
    const duration = tempoInformado ?? DEFAULT_MUTE_DURATION_MS;

    const { user, member, reason, error } = await resolveTarget(message, argsSemTempo);
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
        title: `Mute · ${user.tag ?? user.username}`,
        question: `Deseja realmente mutar ${mention} por ${formatDuration(duration)}?`,
        reason,
        avatarUrl,
      }),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });

    setPendingModeration(
      panelMsg.id,
      {
        action: "mute",
        targetId: user.id,
        targetTag: user.tag ?? user.username,
        reason,
        guild: message.guild,
        member,
        duration,
        avatarUrl,
        message: panelMsg,
        authorId: message.author.id,
      },
      60000
    );
  },
};
