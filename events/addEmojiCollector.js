const { findSession, enqueue, parseEmojis, parseAttachments } = require("../utils/addEmoji/collector");

// Enquanto um painel do /addemoji está ativo, os emojis e imagens que a pessoa enviar no canal viram emojis do servidor.
module.exports = {
  name: "messageCreate",
  async execute(message) {
    if (message.author.bot || !message.guild) return;

    const state = findSession(message.guild.id, message.channelId, message.author.id);
    if (!state || state.closed) return;

    const jobs = [...parseEmojis(message.content), ...parseAttachments(message.attachments)];
    if (jobs.length) enqueue(state, jobs);
  },
};
