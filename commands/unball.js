const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { buildView } = require("../ui/unball");
const { createSession, attachMessage } = require("../utils/unball/state");
const { fetchAllBans } = require("../handlers/unballHandlers");

const V2 = MessageFlags.IsComponentsV2;

async function aviso(message, text) {
  const sent = await message.channel.send({ content: text, allowedMentions: { parse: [] } });
  setTimeout(() => sent.delete().catch(() => {}), 5000);
}

module.exports = {
  name: "unball",
  description: "Painel de banimentos: desbanimento em massa, desbanir um por um e banir várias pessoas.",
  usage: "unball",
  category: "Moderação",
  staffOnly: true,

  async execute(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return aviso(message, "Você não tem permissão para banir e desbanir membros.");
    }
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) {
      return aviso(message, "Eu preciso da permissão Banir Membros para usar este painel.");
    }

    await message.channel.sendTyping().catch(() => {});

    const session = createSession({ guild: message.guild, authorId: message.author.id });
    try {
      session.bans = await fetchAllBans(message.guild);
      session.bansAt = Date.now();
    } catch (err) {
      console.error("[UNBALL] Não consegui ler os banidos:", err?.message ?? err);
      session.bansError = true;
      session.notice = "Não consegui ler a lista de banidos. Verifique a minha permissão Banir Membros.";
    }

    const panel = await message.channel.send({
      components: buildView(session),
      flags: V2,
      allowedMentions: { parse: [] },
    });
    session.notice = null;
    attachMessage(session, panel);
  },
};
