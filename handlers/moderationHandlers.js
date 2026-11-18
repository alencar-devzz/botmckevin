const { MessageFlags } = require("discord.js");
const { clearPendingModeration } = require("../utils/pendingModeration");
const { buildResultPanel, buildDonePanel } = require("../ui/moderation");
const { formatDuration } = require("../utils/formatDuration");
const { markCommandExit, clearCommandExit } = require("../utils/logs/suppress");

function scheduleSelfDelete(interaction, ms) {
  setTimeout(() => {
    // Mensagem efêmera (vinda de slash command) não pode ser apagada pelo canal;
    // nesse caso apaga a própria resposta da interação.
    if (interaction.message?.flags?.has(MessageFlags.Ephemeral)) {
      interaction.deleteReply().catch(() => {});
    } else {
      interaction.message?.delete().catch(() => {});
    }
  }, ms);
}

async function handleModerationButton(interaction) {
  const pending = clearPendingModeration(interaction.message.id);

  if (!pending) {
    await interaction.update({
      components: buildResultPanel("Esta ação expirou ou já foi processada."),
      flags: MessageFlags.IsComponentsV2,
    });
    scheduleSelfDelete(interaction, 5000);
    return;
  }

  if (interaction.customId === "mod_cancel") {
    await interaction.update({
      components: buildResultPanel("Ação cancelada.", pending.avatarUrl),
      flags: MessageFlags.IsComponentsV2,
    });
    scheduleSelfDelete(interaction, 5000);
    return;
  }

  const { action, targetId, reason, guild, member, duration, avatarUrl, authorId } = pending;

  // Kick e ban pelo comando: só o log de Expulsão/Banimento é enviado (ver utils/logs/suppress.js)
  if (action === "ban" || action === "kick") markCommandExit(guild.id, targetId, action);

  try {
    switch (action) {
      case "ban":
        await guild.members.ban(targetId, { reason: reason ?? undefined });
        break;
      case "unban":
        await guild.members.unban(targetId, reason ?? undefined);
        break;
      case "kick":
        await member.kick(reason ?? undefined);
        break;
      case "mute":
        await member.timeout(duration, reason ?? undefined);
        break;
      case "unmute":
        await member.timeout(null, reason ?? undefined);
        break;
    }
  } catch (err) {
    if (action === "ban" || action === "kick") clearCommandExit(guild.id, targetId);
    console.error(`[MODERACAO] Erro ao executar ${action}:`, err);
    await interaction.update({
      components: buildResultPanel(
        "Não foi possível concluir essa ação. Verifique minhas permissões e a hierarquia de cargos.",
        avatarUrl
      ),
      flags: MessageFlags.IsComponentsV2,
    });
    scheduleSelfDelete(interaction, 5000);
    return;
  }

  await interaction.update({
    components: buildDonePanel({
      action,
      userId: targetId,
      executorId: interaction.user.id ?? authorId,
      reason,
      avatarUrl,
      extra: action === "mute" ? `Duração: ${formatDuration(duration)}` : null,
    }),
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
  scheduleSelfDelete(interaction, 5000);
}

module.exports = { handleModerationButton };
