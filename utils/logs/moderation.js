const { AuditLogEvent } = require("discord.js");
const { activeCategory, deliver } = require("./send");
const { findAudit, executorText, originLabel } = require("./audit");
const { COLORS, userBrief, unix, code } = require("./format");

module.exports = [
  // Banimento
  {
    name: "guildBanAdd",
    async execute(ban) {
      const { guild, user } = ban;
      const cfg = await activeCategory(guild, "banimentos", user.bot);
      if (!cfg) return;

      const entry = await findAudit(guild, AuditLogEvent.MemberBanAdd, user.id);
      await deliver(guild, cfg, {
        title: `Banimento${originLabel(entry, guild.client)} — ${guild.name}`,
        color: COLORS.red,
        thumbnail: user.displayAvatarURL(),
        groups: [
          [userBrief(user), `**Executado por:** ${executorText(entry)}`],
          [`**Motivo:** ${entry?.reason ?? ban.reason ?? "Não informado"}`],
        ],
      });
    },
  },

  // Desbanimento
  {
    name: "guildBanRemove",
    async execute(ban) {
      const { guild, user } = ban;
      const cfg = await activeCategory(guild, "banimentos", user.bot);
      if (!cfg) return;

      const entry = await findAudit(guild, AuditLogEvent.MemberBanRemove, user.id);
      await deliver(guild, cfg, {
        title: `Unban${originLabel(entry, guild.client)} — ${guild.name}`,
        color: COLORS.green,
        thumbnail: user.displayAvatarURL(),
        groups: [
          [`**Usuário:** ${user.username} (${user.id})`, `**Executado por:** ${executorText(entry)}`],
          [`**Motivo:** ${entry?.reason ?? "Não informado"}`],
        ],
      });
    },
  },

  // Castigos (timeout) e cargos de membros
  {
    name: "guildMemberUpdate",
    async execute(oldMember, newMember) {
      const { guild } = newMember;
      const user = newMember.user;

      // ----- castigo aplicado / removido -----
      const before = oldMember.communicationDisabledUntilTimestamp ?? null;
      const after = newMember.communicationDisabledUntilTimestamp ?? null;
      const punished = after && after > Date.now();
      const changed = before !== after;

      if (!oldMember.partial && changed && (punished || (before && before > Date.now()))) {
        const cfg = await activeCategory(guild, "castigos", user.bot);
        if (cfg) {
          const entry = await findAudit(guild, AuditLogEvent.MemberUpdate, user.id, {
            match: (e) => e.changes?.some((c) => c.key === "communication_disabled_until"),
          });

          const groups = [[userBrief(user), `**Executado por:** ${executorText(entry)}`]];
          if (punished) {
            groups.push([
              `**Termina em:** <t:${unix(after)}:F> (<t:${unix(after)}:R>)`,
              `**Motivo:** ${entry?.reason ?? "Não informado"}`,
            ]);
          } else {
            groups.push([`**Motivo:** ${entry?.reason ?? "Não informado"}`]);
          }

          await deliver(guild, cfg, {
            title: `${punished ? "Castigo aplicado" : "Castigo removido"}${originLabelSafe(entry, guild)} — ${guild.name}`,
            color: punished ? COLORS.red : COLORS.green,
            thumbnail: user.displayAvatarURL(),
            groups,
          });
        }
      }

      // ----- cargos adicionados / removidos -----
      if (oldMember.partial) return;
      const added = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id));
      const removed = oldMember.roles.cache.filter((r) => !newMember.roles.cache.has(r.id));
      if (!added.size && !removed.size) return;

      const cfg = await activeCategory(guild, "cargos");
      if (!cfg) return;

      const entry = await findAudit(guild, AuditLogEvent.MemberRoleUpdate, user.id);
      if (entry?.executor?.bot && cfg.ignoreBots) return;
      const byBot = entry?.executor?.bot;

      const send = (role, isAdd) =>
        deliver(guild, cfg, {
          title: `Cargo ${isAdd ? "adicionado" : "removido"} ${byBot ? "(Bot)" : "manualmente"} — ${guild.name}`,
          color: isAdd ? COLORS.green : COLORS.red,
          thumbnail: user.displayAvatarURL(),
          groups: [
            [userBrief(user), `**Executado por:** ${executorText(entry)}`],
            [`**Cargo:** <@&${role.id}> (${code(role.name)})`],
          ],
        });

      for (const role of added.values()) await send(role, true);
      for (const role of removed.values()) await send(role, false);
    },
  },
];

function originLabelSafe(entry, guild) {
  return originLabel(entry, guild.client);
}
