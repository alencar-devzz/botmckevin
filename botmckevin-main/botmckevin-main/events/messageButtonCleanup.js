const { purgeMessages } = require("../utils/msgBuilder/response");

// Quando uma mensagem publicada pelo Criador de mensagens é apagada, remove do banco
// as respostas dos botões dela e as imagens guardadas para elas.
module.exports = [
  {
    name: "messageDelete",
    async execute(message) {
      await purgeMessages([message.id]).catch((err) => console.error("[MENSAGEM] Erro ao limpar respostas:", err.message));
    },
  },
  {
    name: "messageDeleteBulk",
    async execute(messages) {
      await purgeMessages([...messages.keys()]).catch((err) => console.error("[MENSAGEM] Erro ao limpar respostas:", err.message));
    },
  },
];
