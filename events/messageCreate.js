const { getPrefix } = require("../utils/getPrefix");
const { suppressMessage, clearSuppressed } = require("../utils/logs/suppress");
const { track } = require("../utils/metrics");
const { getAfk, removeAfk } = require("../utils/afk/store");

// AFK: tira a pessoa do AFK quando ela escreve e avisa quando marcam alguém ausente em mensagem comum
async function handleAfk(message, prefix) {
  const guildId = message.guild.id;
  const isAfkCommand =
    message.content.startsWith(prefix) &&
    message.content.slice(prefix.length).trim().split(/\s+/)[0]?.toLowerCase() === "afk";

  if (!isAfkCommand && (await getAfk(guildId, message.author.id))) {
    await removeAfk(guildId, message.author.id);
    message.channel
      .send({ content: `Bem-vindo de volta <@${message.author.id}>, seu AFK foi removido!` })
      .then((sent) => setTimeout(() => sent.delete().catch(() => {}), 5000))
      .catch(() => {});
  }

  // Aviso de AFK só em mensagens comuns: comandos por prefixo (ex.: n!ban @fulano) não mostram o aviso
  if (message.content.startsWith(prefix)) return;

  const lines = [];
  for (const user of message.mentions.users.values()) {
    if (user.bot || user.id === message.author.id) continue;
    const entry = await getAfk(guildId, user.id);
    if (entry) lines.push(`<@${user.id}> está ausente no momento: ${entry.reason ?? "AFK"}`);
  }
  if (lines.length) {
    message.channel
      .send({ content: lines.join("\n"), allowedMentions: { parse: [] } })
      .catch(() => {});
  }
}

module.exports = {
  name: "messageCreate",
  async execute(message) {
    if (message.author.bot || !message.guild) return;

    const prefix = await getPrefix(message.guild.id);

    try {
      await handleAfk(message, prefix);
    } catch (err) {
      console.error("[AFK] Erro ao processar AFK:", err);
    }

    // "cl" sem prefixo: apaga as mensagens de quem digitou (configurável no n!menu)
    if (message.content.trim().toLowerCase() === "cl") {
      const cl = message.client.commands.get("cl");
      if (!cl) return;
      track("prefixo");
      try {
        return await cl.execute(message, []);
      } catch (err) {
        track("erros");
        console.error('[COMANDO] Erro ao executar "cl":', err);
        return;
      }
    }

    // Comandos normais por prefixo
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const commandName = args.shift().toLowerCase();

    const command = message.client.commands.get(commandName);
    if (!command || typeof command.execute !== "function") return; // comandos só-slash (ex.: /help)

    // Apaga a mensagem do comando assim que ele é reconhecido.
    // Marca como "suprimida" para o sistema de logs não registrar como mensagem apagada.
    track("prefixo");
    suppressMessage(message.id);
    clearSuppressed([message.id]);
    message.delete().catch(() => {});

    try {
      await command.execute(message, args);
    } catch (err) {
      track("erros");
      console.error(`[COMANDO] Erro ao executar "${commandName}":`, err);
      message.channel.send("Ocorreu um erro ao executar este comando.").catch(() => {});
    }
  },
};
