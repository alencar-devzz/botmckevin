const { ContainerBuilder, TextDisplayBuilder } = require("discord.js");

// Painel enquanto limpa
function buildLimpandoPanel({ channel, deleted, total, elapsed }) {
  return [
    new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `### Limpando canal — ${channel.name}`,
          `**Progresso:** \`${deleted}/${total}\``,
          `**Iniciado há:** \`${elapsed}\``,
          `-# **Limpando o canal: <#${channel.id}>**`,
        ].join("\n")
      )
    ),
  ];
}

// Painel quando termina
function buildLimpoPanel({ channel, userId }) {
  return [
    new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `### Canal limpo — ${channel.name}`,
          "**Progresso:** `concluído`",
          "**Iniciado há:** `concluída`",
          `-# **Limpeza em <#${channel.id}> concluída** · **Por** <@${userId}>`,
        ].join("\n")
      )
    ),
  ];
}

module.exports = { buildLimpandoPanel, buildLimpoPanel };
