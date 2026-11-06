const { AuditLogEvent, PermissionsBitField } = require("discord.js");
const { activeCategory, deliver } = require("./send");
const { findAudit, executorText } = require("./audit");
const { add, listLimited } = require("./batch");
const { COLORS, code, permName } = require("./format");

const skipByBot = (cfg, entry) => Boolean(cfg.ignoreBots && entry?.executor?.bot);

// Procura o executor: pelo cargo quando é um só; pela ação mais recente quando são vários
const lookup = (guild, type, items) =>
  findAudit(guild, type, items.length === 1 ? items[0].id : null, { maxAge: 40000 });

function permissionNames(bitfield) {
  const value = BigInt(bitfield);
  return Object.entries(PermissionsBitField.Flags)
    .filter(([, bit]) => value & bit)
    .map(([name]) => name);
}

// ---------- criados / excluídos ----------
async function flushCreateDelete(guild, cfg, items, { created }) {
  const entry = await lookup(guild, created ? AuditLogEvent.RoleCreate : AuditLogEvent.RoleDelete, items);
  if (skipByBot(cfg, entry)) return;

  if (items.length === 1) {
    const i = items[0];
    return deliver(guild, cfg, {
      title: `${created ? "Cargo criado" : "Cargo excluído"} — ${guild.name}`,
      color: created ? COLORS.green : COLORS.red,
      groups: [
        [
          created
            ? `**Cargo:** <@&${i.id}> — ${code(i.name)} (${code(i.id)})`
            : `**Cargo:** ${code(i.name)} (${code(i.id)})`,
          `**Executado por:** ${executorText(entry)}`,
        ],
      ],
    });
  }

  const lines = items.map((i) => (created ? `<@&${i.id}> — ${code(i.name)}` : code(i.name)));
  return deliver(guild, cfg, {
    title: `${created ? "Cargos criados" : "Cargos excluídos"} em massa — ${guild.name}`,
    color: created ? COLORS.green : COLORS.red,
    groups: [
      [`**Executado por:** ${executorText(entry)}`, `**Total:** ${code(items.length)}`],
      listLimited(lines, 20),
    ],
  });
}

// ---------- editados ----------
function renderRoleChanges(i) {
  const groups = [];
  if (i.changes.length) groups.push(i.changes);
  if (i.addedPerms.length || i.removedPerms.length) {
    const lines = ["**Permissões alteradas:**"];
    if (i.addedPerms.length) {
      lines.push(`+ Adicionadas: ${i.addedPerms.slice(0, 12).map((p) => code(permName(p))).join(" ")}`);
    }
    if (i.removedPerms.length) {
      lines.push(`- Removidas: ${i.removedPerms.slice(0, 12).map((p) => code(permName(p))).join(" ")}`);
    }
    groups.push(lines);
  }
  return groups;
}

async function flushUpdate(guild, cfg, items) {
  const entry = await lookup(guild, AuditLogEvent.RoleUpdate, items);
  if (skipByBot(cfg, entry)) return;

  if (items.length === 1) {
    const i = items[0];
    return deliver(guild, cfg, {
      title: `Cargo editado — ${guild.name}`,
      color: COLORS.white,
      groups: [
        [`**Cargo:** <@&${i.id}> — ${code(i.name)} (${code(i.id)})`, `**Executado por:** ${executorText(entry)}`],
        ...renderRoleChanges(i),
      ],
    });
  }

  const ids = [...new Set(items.map((i) => i.id))];
  const groups = [
    [`**Executado por:** ${executorText(entry)}`, `**Cargos editados:** ${code(ids.length)}`],
  ];

  // Um bloco compacto por cargo (limitado)
  for (const i of items.slice(0, 6)) {
    const lines = [`**<@&${i.id}>**`, ...i.changes.slice(0, 3)];
    if (i.addedPerms.length) lines.push(`+ ${i.addedPerms.slice(0, 6).map((p) => code(permName(p))).join(" ")}`);
    if (i.removedPerms.length) lines.push(`- ${i.removedPerms.slice(0, 6).map((p) => code(permName(p))).join(" ")}`);
    groups.push(lines);
  }
  if (items.length > 6) groups.push([`… e mais ${items.length - 6} cargo(s) editado(s)`]);

  return deliver(guild, cfg, {
    title: `Cargos editados em massa — ${guild.name}`,
    color: COLORS.white,
    groups,
  });
}

module.exports = [
  {
    name: "roleCreate",
    async execute(role) {
      const { guild } = role;
      const cfg = await activeCategory(guild, "cargos");
      if (!cfg) return;
      add(`rcreate:${guild.id}`, { id: role.id, name: role.name }, (items) =>
        flushCreateDelete(guild, cfg, items, { created: true })
      );
    },
  },

  {
    name: "roleDelete",
    async execute(role) {
      const { guild } = role;
      const cfg = await activeCategory(guild, "cargos");
      if (!cfg) return;
      add(`rdelete:${guild.id}`, { id: role.id, name: role.name }, (items) =>
        flushCreateDelete(guild, cfg, items, { created: false })
      );
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

      add(`rupdate:${guild.id}`, { id: newRole.id, name: newRole.name, changes, addedPerms, removedPerms }, (items) =>
        flushUpdate(guild, cfg, items)
      );
    },
  },
];
