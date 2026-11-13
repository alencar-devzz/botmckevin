const { AuditLogEvent } = require("discord.js");
const { activeCategory, deliver } = require("./send");
const { findAudit, executorText, originLabel } = require("./audit");
const { COLORS, code, userBrief, formatSpan, unix } = require("./format");
const { getCommandExit } = require("./suppress");

module.exports = [
  // Entrada
  {
    name: "guildMemberAdd",
    async execute(member) {
      const cfg = await activeCategory(member.guild, "entradas", member.user.bot);
      if (!cfg) return;

      const days = ((Date.now() - member.user.createdTimestamp) / 86400000).toFixed(1);

      await deliver(member.guild, cfg, {
        title: `Entrada — ${member.guild.name}`,
        color: COLORS.green,
        thumbnail: member.displayAvatarURL(),
        groups: [
          [`**Usuário:** <@${member.id}> (${member.user.username})`],
          [
            `**ID:** ${code(member.id)}`,
            `**Tag:** ${code(member.user.username)}`,
            `**Conta criada em:** <t:${unix(member.user.createdTimestamp)}:F> (${code(days)} dia(s) atrás)`,
            `**Membros no servidor:** ${code(member.guild.memberCount)}`,
          ],
        ],
      });
    },
  },

  // Saída (e expulsão, quando foi expulso)
  {
    name: "guildMemberRemove",
    async execute(member) {
      const { guild } = member;
      const user = member.user;
      if (!user) return;

      // Kick/ban feito pelo comando: sem log de saída (e sem lista de cargos); só Expulsão ou Banimento
      const byCommand = getCommandExit(guild.id, user.id);
      if (byCommand === "ban") return; // o log de Banimento sai em guildBanAdd

      const leaveCfg = byCommand ? null : await activeCategory(guild, "entradas", user.bot);
      if (leaveCfg) {
        const roles = member.roles?.cache
          ? [...member.roles.cache.values()].filter((r) => r.id !== guild.id).slice(0, 15)
          : [];
        const staying = member.joinedTimestamp
          ? code(formatSpan(Date.now() - member.joinedTimestamp))
          : code("Desconhecido");

        await deliver(guild, leaveCfg, {
          title: `Saída — ${guild.name}`,
          color: COLORS.red,
          thumbnail: user.displayAvatarURL(),
          groups: [
            [`**Usuário:** <@${user.id}> (${user.username})`],
            [
              `**ID:** ${code(user.id)}`,
              `**Tag:** ${code(user.username)}`,
              `**Estava no servidor há:** ${staying}`,
              `**Cargos que possuía:** ${roles.length ? roles.map((r) => `<@&${r.id}>`).join(" ") : code("Nenhum")}`,
              `**Membros no servidor:** ${code(guild.memberCount)}`,
            ],
          ],
        });
      }

      // Expulsão: só olha o registro de auditoria se a categoria estiver ativa
      const kickCfg = await activeCategory(guild, "expulsoes", user.bot);
      if (!kickCfg) return;

      const entry = await findAudit(guild, AuditLogEvent.MemberKick, user.id);
      if (!entry) return; // saiu sozinho

      await deliver(guild, kickCfg, {
        title: `Expulsão${originLabel(entry, guild.client)} — ${guild.name}`,
        color: COLORS.red,
        thumbnail: user.displayAvatarURL(),
        groups: [
          [userBrief(user), `**Executado por:** ${executorText(entry)}`],
          [`**Motivo:** ${entry.reason ?? "Não informado"}`],
        ],
      });
    },
  },
];
