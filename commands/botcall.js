const { MessageFlags } = require("discord.js");
const { buildBotcallPanel } = require("../ui/botcall");
const { getCallView, registerPanel } = require("../utils/callKeeper");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");

// n!botcall: envia o painel do sistema de call do bot (só a equipe).
// A mensagem do comando já é apagada pelo events/messageCreate.js.
module.exports = {
  name: "botcall",
  async execute(message) {
    if (!message.member.roles.cache.hasAny(...ALL_STAFF_ROLE_IDS)) {
      const warning = await message.channel
        .send("Você não tem permissão para usar este comando.")
        .catch(() => null);
      setTimeout(() => warning?.delete().catch(() => {}), 5000);
      return;
    }

    // O painel já nasce mostrando a situação real do bot (conectado, reconectando ou desconectado)
    const view = getCallView(message.guild.id);
    const panel = await message.channel.send({
      components: buildBotcallPanel(view),
      flags: MessageFlags.IsComponentsV2,
    });

    // Esse painel passa a ser atualizado em tempo real
    registerPanel(message.guild.id, message.channel.id, panel.id, { rendered: view });
  },
};
