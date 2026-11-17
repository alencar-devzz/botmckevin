const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require("discord.js");
const { getInviteConfig, getBonus, incrementGranted } = require("./configStore");
const { getStats } = require("./store");

// Convites válidos de uma pessoa = entradas que não saíram e não são fake, mais o ajuste manual dela.
async function getValidCount(guild, inviterId) {
  const cfg = await getInviteConfig(guild.id);
  const stats = await getStats(guild.id, inviterId, cfg.fakeDays);
  const valid = Math.max(0, stats.joined - stats.left - stats.fake);
  return valid + getBonus(cfg, inviterId);
}

async function announce(guild, cfg, member, role, invites) {
  if (!cfg.achievementsChannelId || !cfg.announceRewards) return;
  const channel = guild.channels.cache.get(cfg.achievementsChannelId);
  if (!channel?.isTextBased?.()) return;

  const container = new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### Nova conquista de convites\n${member} chegou a **${invites}** convite(s) válido(s) e recebeu o cargo <@&${role.id}>.`
    )
  );
  await channel
    .send({ components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } })
    .catch(() => {});
}

// Confere, depois de uma entrada nova, se quem convidou bateu alguma meta de recompensa ainda não recebida.
async function checkRewards(guild, inviterId) {
  if (!inviterId) return;
  const cfg = await getInviteConfig(guild.id);
  if (!cfg.enabled || !cfg.rewards.length) return;

  const member = await guild.members.fetch(inviterId).catch(() => null);
  if (!member) return;

  const valid = await getValidCount(guild, inviterId);

  for (const reward of cfg.rewards) {
    if (valid < reward.invites) continue;
    if (member.roles.cache.has(reward.roleId)) continue;
    const role = guild.roles.cache.get(reward.roleId);
    if (!role) continue;

    await member.roles.add(role).catch(() => null);
    if (member.roles.cache.has(reward.roleId)) {
      await incrementGranted(guild.id, 1).catch(() => {});
      await announce(guild, cfg, member, role, reward.invites);
    }
  }
}

module.exports = { getValidCount, checkRewards };
