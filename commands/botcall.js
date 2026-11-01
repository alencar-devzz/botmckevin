const { MessageFlags } = require("discord.js");
const { buildBotcallPanel } = require("../ui/botcall");
const { STAFF_ROLE_IDS } = require("../utils/ticketConfig");

module.exports = {
  name: "botcall",
  async execute(message) {
    // Apenas os cargos da equipe podem usar o comando
    if (!message.member.roles.cache.hasAny(...STAFF_ROLE_IDS)) {
      const warning = await message.channel
        .send("Você não tem permissão para usar esse comando.")
        .catch(() => null);

      setTimeout(() => {
        warning?.delete().catch(() => {});
        message.delete().catch(() => {});
      }, 5000);
      return;
    }

    message.delete().catch(() => {});

    // Se o bot já estiver em uma call, o painel já nasce mostrando ela como conectada
    const currentId = message.guild.members.me?.voice?.channelId ?? null;

    await message.channel.send({
      components: buildBotcallPanel({ selectedId: currentId, connected: Boolean(currentId) }),
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
