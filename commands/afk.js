const { setAfk } = require("../utils/afk/store");

const MAX_REASON = 200;

module.exports = {
  name: "afk",
  async execute(message, args) {
    const raw = args.join(" ").trim();

    if (raw.length > MAX_REASON) {
      await message.channel
        .send({
          content: `<@${message.author.id}> o motivo do AFK pode ter no máximo ${MAX_REASON} caracteres.`,
          allowedMentions: { parse: [] },
        })
        .catch(() => {});
      return;
    }

    const reason = raw || null;
    await setAfk(message.guild.id, message.author.id, reason);

    const sent = await message.channel.send({
      content: `<@${message.author.id}> Seu AFK foi ativado: ${reason ?? "Não informado"}`,
      allowedMentions: { parse: [] },
    });
    setTimeout(() => sent.delete().catch(() => {}), 5000);
  },
};
