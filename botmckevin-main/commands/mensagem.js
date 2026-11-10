const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { buildMessageHome } = require("../ui/mensagemPanels");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");

const V2 = MessageFlags.IsComponentsV2;

// Envia o painel do Criador de mensagens. O botão dele abre o editor (só para quem clicou).
// Só quem tem um dos cargos de utils/staffRoles.js (ou Administrador) pode usar.
module.exports = {
  name: "mensagem",
  aliases: ["msg"],
  async execute(message) {
    const { guild, member, channel } = message;

    const allowed =
      member.permissions.has(PermissionFlagsBits.Administrator) || member.roles.cache.hasAny(...ALL_STAFF_ROLE_IDS);
    if (!allowed) {
      const sent = await channel
        .send({ content: `${message.author}, você não tem permissão para usar este comando.`, allowedMentions: { parse: [] } })
        .catch(() => null);
      setTimeout(() => sent?.delete().catch(() => {}), 8000);
      return;
    }

    await channel.send({
      components: buildMessageHome(guild),
      flags: V2,
      allowedMentions: { parse: [] },
    });
  },
};
