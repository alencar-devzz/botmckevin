const { AuditLogEvent, PermissionsBitField } = require("discord.js");
const { activeCategory, deliver } = require("./send");
const { findAudit, executorText } = require("./audit");
const { COLORS, code, permName } = require("./format");

const skipByBot = (cfg, entry) => Boolean(cfg.ignoreBots && entry?.executor?.bot);

function permissionNames(bitfield) {
  const value = BigInt(bitfield);
  return Object.entries(PermissionsBitField.Flags)
    .filter(([, bit]) => value & bit)
    .map(([name]) => name);
}

module.exports = [
  {
    name: "roleCreate",
    async execute(role) {
      const { guild } = role;
      const cfg = await activeCategory(guild, "cargos");
      if (!cfg) return;

      const entry = await findAudit(guild, AuditLogEvent.RoleCreate, role.id);
      if (skipByBot(cfg, entry)) return;

      await deliver(guild, cfg, {
        title: `Cargo criado — ${guild.name}`,
        color: COLORS.green,
        groups: [
          [
            `**Cargo:** <@&${role.id}> — ${code(role.name)} (${code(role.id)})`,
            `**Executado por:** ${executorText(entry)}`,
          ],
        ],
      });
    },
  },

  {
    name: "roleDelete",
    async execute(role) {
      const { guild } = role;
      const cfg = await activeCategory(guild, "cargos");
      if (!cfg) return;

      const entry = await findAudit(guild, AuditLogEvent.RoleDelete, role.id);
      if (skipByBot(cfg, entry)) return;

      await deliver(guild, cfg, {
        title: `Cargo excluído — ${guild.name}`,
        color: COLORS.red,
        groups: [
          [
            `**Cargo:** ${code(role.name)} (${code(role.id)})`,
            `**Executado por:** ${executorText(entry)}`,
          ],
        ],
      });
    },
  },

  {
    name: "roleUpdate",
    async execute(oldRole, newRole) {
      const { guild } = newRole;

      const changes = [];
      const push = (label, a, b) => {
        if (a !== b) changes.push(`**${label}:** ${code(a)} → ${code(b)}`);
      };
      push("Nome", oldRole.name, newRole.name);
      push("Cor", oldRole.hexColor, newRole.hexColor);
      push("Exibir separado", oldRole.hoist ? "Sim" : "Não", newRole.hoist ? "Sim" : "Não");
      push("Mencionável", oldRole.mentionable ? "Sim" : "Não", newRole.mentionable ? "Sim" : "Não");

      const before = permissionNames(oldRole.permissions.bitfield);
      const after = permissionNames(newRole.permissions.bitfield);
      const addedPerms = after.filter((p) => !before.includes(p));
      const removedPerms = before.filter((p) => !after.includes(p));

      if (!changes.length && !addedPerms.length && !removedPerms.length) return; // só mudou a posição

      const cfg = await activeCategory(guild, "cargos");
      if (!cfg) return;

      const entry = await findAudit(guild, AuditLogEvent.RoleUpdate, newRole.id);
      if (skipByBot(cfg, entry)) return;

      const groups = [
        [
          `**Cargo:** <@&${newRole.id}> — ${code(newRole.name)} (${code(newRole.id)})`,
          `**Executado por:** ${executorText(entry)}`,
        ],
      ];
      if (changes.length) groups.push(changes);

      if (addedPerms.length || removedPerms.length) {
        const lines = ["**Permissões alteradas:**"];
        if (addedPerms.length) {
          lines.push(`+ Adicionadas: ${addedPerms.slice(0, 12).map((p) => code(permName(p))).join(" ")}`);
        }
        if (removedPerms.length) {
          lines.push(`- Removidas: ${removedPerms.slice(0, 12).map((p) => code(permName(p))).join(" ")}`);
        }
        groups.push(lines);
      }

      await deliver(guild, cfg, {
        title: `Cargo editado — ${guild.name}`,
        color: COLORS.white,
        groups,
      });
    },
  },
];
