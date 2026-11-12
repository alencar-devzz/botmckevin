const { MessageFlags, ContainerBuilder, TextDisplayBuilder } = require("discord.js");
const { getGuildConfig } = require("../database/getGuildConfig");
const { sendGreeting, sendWelcomeDm, accountAgeDays } = require("../utils/portaria");
const { runGate } = require("../utils/antiraid/joinGate");

async function addRoles(member, roleIds) {
  for (const roleId of roleIds ?? []) {
    const role = member.guild.roles.cache.get(roleId);
    if (role) await member.roles.add(role).catch(() => {});
  }
}

// Filtro de contas novas: avisa o membro na DM e expulsa. Retorna true se expulsou.
async function filterNewAccount(member, config) {
  if (!config.accountFilterEnabled || !config.accountMinAgeDays) return false;
  if (accountAgeDays(member) >= config.accountMinAgeDays) return false;

  const days = config.accountMinAgeDays;
  await member
    .send({
      components: [
        new ContainerBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent("### Entrada não permitida"),
            new TextDisplayBuilder().setContent(
              `O servidor **${member.guild.name}** só aceita contas com pelo menos **${days} dia(s)** de criação. Tente entrar novamente quando a sua conta atingir esse tempo.`
            )
          ),
      ],
      flags: MessageFlags.IsComponentsV2,
    })
    .catch(() => {});

  return member
    .kick(`Portaria: conta com menos de ${days} dia(s)`)
    .then(() => true)
    .catch(() => false);
}

module.exports = {
  name: "guildMemberAdd",
  async execute(member) {
    // O Anti-Raid (anti-bot e anti-alt) decide primeiro: quem for barrado não ganha cargo nem boas-vindas
    if (await runGate(member)) return;

    const config = await getGuildConfig(member.guild.id);

    // Bots: só recebem os cargos exclusivos de bots
    if (member.user.bot) {
      await addRoles(member, config.botAutoRoles);
      return;
    }

    if (await filterNewAccount(member, config)) return;

    // Auto-roles
    await addRoles(member, config.autoRoles);

    // Boas-vindas no canal e na DM
    await sendGreeting("welcome", member, config);
    await sendWelcomeDm(member, config);
  },
};
