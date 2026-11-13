const { MessageFlags } = require("discord.js");
const { getAntiRaidConfig } = require("../utils/antiraid/store");
const { buildAntiRaidHome } = require("../ui/antiraid");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");

const V2 = MessageFlags.IsComponentsV2;

// Envia o painel compacto do Anti-Raid. O botão dele abre os painéis de configuração.
// Só quem tem um dos cargos de utils/staffRoles.js pode enviar o painel.
module.exports = {
  name: "painelps",
  async execute(message) {
    const { guild, member, channel } = message;

    const allowed = member.roles.cache.hasAny(...ALL_STAFF_ROLE_IDS);
    if (!allowed) {
      const sent = await channel
        .send({ content: `${message.author}, você não tem permissão para usar este comando.`, allowedMentions: { parse: [] } })
        .catch(() => null);
      setTimeout(() => sent?.delete().catch(() => {}), 8000);
      return;
    }

    const cfg = await getAntiRaidConfig(guild.id);
    await channel.send({
      components: buildAntiRaidHome(guild, cfg),
      flags: V2,
      allowedMentions: { parse: [] },
    });
  },
};
