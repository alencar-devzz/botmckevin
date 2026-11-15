const { MessageFlags } = require("discord.js");
const { buildTagPanel } = require("../ui/tag");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");

module.exports = {
  name: "tag",
  description: "Envia o painel de tags: cada botão entrega um cargo.",
  usage: "tag",
  category: "Comunidade",
  staffOnly: true,

  async execute(message) {
    // Apenas os cargos da equipe podem usar o comando
    if (!message.member?.roles.cache.hasAny(...ALL_STAFF_ROLE_IDS)) {
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

    await message.channel.send({
      components: buildTagPanel(),
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
