const { MessageFlags } = require("discord.js");
const { buildConfirmPanel, buildResultPanel } = require("../ui/moderation");
const { setPendingModeration } = require("./pendingModeration");

// Todas as respostas dos slash commands de moderação são efêmeras
// (só quem usou o comando consegue ver) e em Components V2.
const EPHEMERAL_V2 = MessageFlags.Ephemeral | MessageFlags.IsComponentsV2;

// Resposta simples (erro/aviso) efêmera.
function replyEphemeral(interaction, text) {
  return interaction.reply({
    components: buildResultPanel(text),
    flags: EPHEMERAL_V2,
  });
}

// Confere a permissão de quem usou o comando.
// Retorna true se pode continuar; se não puder, já responde (efêmero) e retorna false.
async function requirePermission(interaction, permission, text) {
  if (interaction.memberPermissions?.has(permission)) return true;
  await replyEphemeral(interaction, text);
  return false;
}

// Valida o alvo da ação. Retorna o texto do erro, ou null se estiver tudo certo.
// botCheck: "bannable" | "kickable" | "moderatable" (o que o bot consegue fazer com o membro)
function validateTarget(interaction, { user, member, requireMember = false, botCheck = null }) {
  const { guild, client } = interaction;

  if (user.id === interaction.user.id) {
    return "Você não pode usar este comando em si mesmo.";
  }
  if (user.id === client.user.id) {
    return "Não posso usar este comando em mim mesmo.";
  }
  if (user.id === guild.ownerId) {
    return "Não é possível usar este comando no dono do servidor.";
  }
  if (requireMember && !member) {
    return "Esse usuário não está neste servidor.";
  }

  if (member) {
    const autorEhDono = interaction.user.id === guild.ownerId;
    if (
      !autorEhDono &&
      interaction.member.roles.highest.comparePositionTo(member.roles.highest) <= 0
    ) {
      return "Você não pode moderar alguém com cargo igual ou superior ao seu.";
    }

    if (botCheck && member[botCheck] === false) {
      return "Não consigo executar essa ação nesse usuário. Verifique a hierarquia dos meus cargos e as minhas permissões.";
    }
  }

  return null;
}

// Mostra o painel de confirmação (efêmero, sem expiração) e deixa a ação pendente.
// Os botões Confirmar/Cancelar continuam sendo tratados por handlers/moderationHandlers.js.
async function sendConfirm(interaction, { action, title, question, user, member, reason, duration }) {
  // Foto do usuário no canto do painel; sem aviso de expiração.
  const avatarUrl = user.displayAvatarURL({ extension: "png", size: 256 });

  await interaction.reply({
    components: buildConfirmPanel({ title, question, reason, avatarUrl, expires: false }),
    flags: EPHEMERAL_V2,
  });

  const panelMsg = await interaction.fetchReply();

  setPendingModeration(
    panelMsg.id,
    {
      action,
      targetId: user.id,
      targetTag: user.tag ?? user.username,
      reason,
      guild: interaction.guild,
      member,
      duration,
      avatarUrl,
      // Mensagem efêmera não pode ser apagada pelo canal: ao expirar,
      // o painel é removido pela própria resposta da interação.
      message: { delete: () => interaction.deleteReply() },
      authorId: interaction.user.id,
    },
    null // sem expiração
  );
}

module.exports = { EPHEMERAL_V2, replyEphemeral, requirePermission, validateTarget, sendConfirm };
