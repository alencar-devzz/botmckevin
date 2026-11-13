const { getPrefix } = require("../utils/getPrefix");
const { suppressMessage, clearSuppressed } = require("../utils/logs/suppress");
const { track } = require("../utils/metrics");

module.exports = {
  name: "messageCreate",
  async execute(message) {
    if (message.author.bot || !message.guild) return;

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
    const prefix = await getPrefix(message.guild.id);
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
