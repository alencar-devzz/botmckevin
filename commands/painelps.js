const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { getAntiRaidConfig } = require("../utils/antiraid/store");
const { buildAntiRaidHome, buildNotice } = require("../ui/antiraid");

const V2 = MessageFlags.IsComponentsV2;

// Envia o painel compacto do Anti-Raid. O botão dele abre os painéis de configuração.
// Só o dono do servidor ou quem tem Administrador pode enviar e usar.
module.exports = {
  name: "painelps",
  async execute(message) {
    const { guild, member, channel } = message;

    const allowed = guild.ownerId === member.id || member.permissions.has(PermissionFlagsBits.Administrator);
    if (!allowed) {
      const sent = await channel
        .send({ components: buildNotice("Só o dono ou quem tem Administrador pode abrir o painel do Anti-Raid."), flags: V2 })
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
