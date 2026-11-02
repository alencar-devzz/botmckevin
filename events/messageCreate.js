const { getPrefix } = require("../utils/getPrefix");

module.exports = {
  name: "messageCreate",
  async execute(message) {
    if (message.author.bot || !message.guild) return;

    // Comandos normais por prefixo
    const prefix = await getPrefix(message.guild.id);
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const commandName = args.shift().toLowerCase();

    const command = message.client.commands.get(commandName);
    if (!command) return;

    // Apaga a mensagem do comando assim que ele é reconhecido
    message.delete().catch(() => {});

    try {
      await command.execute(message, args);
    } catch (err) {
      console.error(`[COMANDO] Erro ao executar "${commandName}":`, err);
      message.channel.send("Ocorreu um erro ao executar este comando.").catch(() => {});
    }
  },
};
