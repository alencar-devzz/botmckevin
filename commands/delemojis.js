const { PermissionFlagsBits } = require("discord.js");

// COMANDO TEMPORÁRIO: apaga todos os emojis do servidor o mais rápido possível.
// Depois de usar, apague este arquivo (commands/delemojis.js) do repositório.

const LOTE = 10; // exclusões simultâneas (o discord.js enfileira sozinho se bater no limite de requisições)

async function aviso(channel, content, segundos = 8) {
  const sent = await channel.send({ content, allowedMentions: { parse: [] } }).catch(() => null);
  if (sent) setTimeout(() => sent.delete().catch(() => {}), segundos * 1000);
  return sent;
}

module.exports = {
  name: "delemojis",
  aliases: ["apagaremojis", "limparemojis"],
  category: "Moderação",
  description: "Temporário: apaga todos os emojis do servidor.",
  usage: "delemojis",
  staffOnly: true,

  async execute(message) {
    const { guild, member, channel } = message;
    if (!guild || !member) return;

    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      return aviso(channel, "Apenas administradores podem usar este comando.");
    }
    if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
      return aviso(channel, "Eu preciso da permissão Gerenciar Expressões para apagar emojis.");
    }

    let emojis;
    try {
      emojis = [...(await guild.emojis.fetch()).values()];
    } catch (err) {
      console.error("[DELEMOJIS] Não consegui listar os emojis:", err?.message ?? err);
      return aviso(channel, "Não consegui listar os emojis do servidor.");
    }

    if (!emojis.length) return aviso(channel, "Este servidor não tem nenhum emoji.");

    const inicio = Date.now();
    const status = await channel
      .send({ content: `Apagando **${emojis.length}** emojis...`, allowedMentions: { parse: [] } })
      .catch(() => null);

    let apagados = 0;
    let falhas = 0;

    for (let i = 0; i < emojis.length; i += LOTE) {
      const resultados = await Promise.allSettled(
        emojis.slice(i, i + LOTE).map((e) => guild.emojis.delete(e, `delemojis por ${message.author.tag}`))
      );
      for (const r of resultados) {
        if (r.status === "fulfilled") apagados++;
        else {
          falhas++;
          console.error("[DELEMOJIS] Falha ao apagar um emoji:", r.reason?.message ?? r.reason);
        }
      }
    }

    const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
    const texto =
      `Concluído em **${segundos}s**: **${apagados}** emojis apagados` +
      (falhas ? `, **${falhas}** falharam (confira o console).` : ".");

    if (status) {
      await status.edit({ content: texto, allowedMentions: { parse: [] } }).catch(() => {});
      setTimeout(() => status.delete().catch(() => {}), 10_000);
    } else {
      aviso(channel, texto, 10);
    }
  },
};
