const { MessageFlags } = require("discord.js");
const { clearPendingModeration } = require("../utils/pendingModeration");
const { buildResultPanel } = require("../ui/moderation");
const { formatDuration } = require("../utils/formatDuration");

function scheduleSelfDelete(interaction, ms) {
  setTimeout(() => {
    interaction.message?.delete().catch(() => {});
  }, ms);
}

function successText(action, targetTag, targetId, duration) {
  if (action === "mute") {
    return `**${targetTag}** · \`${targetId}\` Foi mutado com sucesso por ${formatDuration(duration)}!`;
  }

  const verbos = {
    ban: "Foi banido com sucesso!",
    unban: "Foi desbanido com sucesso!",
    kick: "Foi expulso com sucesso!",
    unmute: "Foi desmutado com sucesso!",
  };
  return `**${targetTag}** · \`${targetId}\` ${verbos[action]}`;
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
      components: buildResultPanel("Ação cancelada."),
      flags: MessageFlags.IsComponentsV2,
    });
    scheduleSelfDelete(interaction, 5000);
    return;
  }

  const { action, targetId, targetTag, reason, guild, member, duration } = pending;

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
    console.error(`[MODERACAO] Erro ao executar ${action}:`, err);
    await interaction.update({
      components: buildResultPanel(
        "Não foi possível concluir essa ação. Verifique minhas permissões e a hierarquia de cargos."
      ),
      flags: MessageFlags.IsComponentsV2,
    });
    scheduleSelfDelete(interaction, 5000);
    return;
  }

  await interaction.update({
    components: buildResultPanel(successText(action, targetTag, targetId, duration)),
    flags: MessageFlags.IsComponentsV2,
  });
  scheduleSelfDelete(interaction, 5000);
}

module.exports = { handleModerationButton };
