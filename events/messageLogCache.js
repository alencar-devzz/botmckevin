// Guarda no Mongo toda mensagem enviada nos servidores, para o log de mensagens apagadas/editadas
// continuar funcionando depois que o bot reinicia (o cache do discord.js é perdido).
const { saveMessage } = require("../utils/logs/messageStore");

module.exports = {
  name: "messageCreate",
  async execute(message) {
    if (!message.guild) return;
    await saveMessage(message);
  },
};
