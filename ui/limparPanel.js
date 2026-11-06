const { ContainerBuilder, TextDisplayBuilder } = require("discord.js");

// Painel enquanto limpa
// startedAt: início em ms. O horário relativo do Discord (<t:...:R>) conta sozinho no app.
function buildLimpandoPanel({ channel, deleted, total, startedAt }) {
  return [
    new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `## Limpando canal — ${channel.name}`,
          `**Progresso:** \`${deleted}/${total}\``,
          `**Iniciado:** <t:${Math.floor(startedAt / 1000)}:R>`,
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
          `## Canal limpo — ${channel.name}`,
          "**Progresso:** `concluído`",
          "**Iniciado há:** `concluída`",
          `-# **Limpeza em <#${channel.id}> concluída** · **Por** <@${userId}>`,
        ].join("\n")
      )
    ),
  ];
}

module.exports = { buildLimpandoPanel, buildLimpoPanel };
