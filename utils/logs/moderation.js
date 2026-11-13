const { AuditLogEvent } = require("discord.js");
const { activeCategory, deliver } = require("./send");
const { findAudit, executorText, originLabel } = require("./audit");
const { COLORS, userBrief, unix, code } = require("./format");
const { consumeRoleChange } = require("./suppress");
const { aboveBot } = require("./botRole");
const { getCommandExit } = require("./suppress");

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

      // Kick/ban feito pelo comando: nenhum log de cargo ou castigo desse membro
      if (getCommandExit(guild.id, user.id)) return;

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
      // Mudanças feitas pelo painel n!groles têm log próprio (utils/logs/panelRoles.js), então saem daqui
      const added = newMember.roles.cache.filter(
        (r) => !aboveBot(guild, r) && !oldMember.roles.cache.has(r.id) && !consumeRoleChange(guild.id, user.id, r.id, "add")
      );
      const removed = oldMember.roles.cache.filter(
        (r) => !aboveBot(guild, r) && !newMember.roles.cache.has(r.id) && !consumeRoleChange(guild.id, user.id, r.id, "rem")
      );
      if (!added.size && !removed.size) return;

      const cfg = await activeCategory(guild, "cargos");
      if (!cfg) return;

      const entry = await findAudit(guild, AuditLogEvent.MemberRoleUpdate, user.id);
      if (entry?.executor?.bot && cfg.ignoreBots) return;
      const byBot = entry?.executor?.bot;

      // Todos os cargos da mesma alteração vão numa embed só
      // @cargo · `nome` · `id`
      const roleLine = (role) => `<@&${role.id}> · ${code(role.name)} · ${code(role.id)}`;
      const groups = [[userBrief(user), `**Executado por:** ${executorText(entry)}`]];
      if (added.size) groups.push([`**Cargos adicionados (${added.size}):**`, ...[...added.values()].map(roleLine)]);
      if (removed.size) groups.push([`**Cargos removidos (${removed.size}):**`, ...[...removed.values()].map(roleLine)]);

      const title =
        added.size && removed.size
          ? "Cargos alterados"
          : `Cargo${(added.size || removed.size) > 1 ? "s" : ""} ${added.size ? "adicionado" : "removido"}${(added.size || removed.size) > 1 ? "s" : ""}`;

      await deliver(guild, cfg, {
        title: `${title}${byBot ? " (Bot)" : ""} — ${guild.name}`,
        color: added.size && removed.size ? COLORS.white : added.size ? COLORS.green : COLORS.red,
        thumbnail: user.displayAvatarURL(),
        groups,
      });
    },
  },
];

function originLabelSafe(entry, guild) {
  return originLabel(entry, guild.client);
}
