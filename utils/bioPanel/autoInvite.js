const { ChannelType, PermissionFlagsBits } = require("discord.js");

// Gera o convite permanente (sem validade e sem limite de usos) que o painel "Cargos por perfil"
// usa como padrão fixo de verificação. O convite anterior, criado pelo próprio bot, é apagado
// depois que o novo existe, para não acumular links permanentes soltos no servidor.

const INVITABLE = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildVoice,
  ChannelType.GuildStageVoice,
  ChannelType.GuildForum,
]);

// Canal onde o convite nasce: regras, sistema, atualizações da comunidade e, por fim, o primeiro que o bot alcança
async function pickChannel(guild) {
  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (!me) return null;
  const can = (c) => c && INVITABLE.has(c.type) && c.permissionsFor(me)?.has(PermissionFlagsBits.CreateInstantInvite);

  const preferred = [guild.rulesChannel, guild.systemChannel, guild.publicUpdatesChannel].find(can);
  if (preferred) return preferred;
  return [...guild.channels.cache.values()].sort((a, b) => a.rawPosition - b.rawPosition).find(can) ?? null;
}

// Retorna { ok: true, url, code } ou { ok: false, reason }
async function createPermanentInvite(guild, previousCode = null) {
  const channel = await pickChannel(guild);
  if (!channel) {
    return { ok: false, reason: "Não encontrei um canal onde eu possa criar convites. Dê ao bot a permissão Criar convite." };
  }

  let invite;
  try {
    invite = await channel.createInvite({
      maxAge: 0,
      maxUses: 0,
      temporary: false,
      unique: true,
      reason: "Convite fixo do painel Cargos por perfil",
    });
  } catch {
    return { ok: false, reason: "O Discord recusou a criação do convite. Confira a permissão Criar convite do bot." };
  }

  if (previousCode && previousCode !== invite.code) {
    await guild.invites.delete(previousCode, "Convite fixo substituído no painel Cargos por perfil").catch(() => null);
  }

  return { ok: true, code: invite.code, url: `https://discord.gg/${invite.code}` };
}

module.exports = { createPermanentInvite };
