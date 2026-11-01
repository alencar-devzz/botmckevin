const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { resolveTarget } = require("../utils/resolveTarget");
const { buildConfirmPanel } = require("../ui/moderation");
const { setPendingModeration } = require("../utils/pendingModeration");
const { extractDuration } = require("../utils/parseDuration");
const { formatDuration } = require("../utils/formatDuration");

// Duração padrão usada quando a pessoa não informa um tempo no comando.
// Ex: n!mute @user 10m motivo   |   n!mute @user 2h   |   n!mute @user motivo (usa o padrão abaixo)
// Tempos aceitos: s (segundos), m (minutos), h (horas), d (dias), w (semanas).
// O máximo é limitado automaticamente a 28 dias, que é o teto da API do Discord.
const DEFAULT_MUTE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 horas

module.exports = {
  name: "mute",
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
    const panelMsg = await message.channel.send({
      components: buildConfirmPanel({
        title: `Mute · ${user.tag ?? user.username}`,
        question: `Deseja realmente mutar ${mention} por ${formatDuration(duration)}?`,
        reason,
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
        message: panelMsg,
        authorId: message.author.id,
      },
      60000
    );
  },
};
