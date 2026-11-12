const { AuditLogEvent, PermissionsBitField } = require("discord.js");
const { getAntiRaidConfig } = require("./store");
const { sendModuleAlert, code } = require("./alert");
const { findAuditEntry, isAuthorized } = require("./audit");
const { punish } = require("./engine");
const { DP_PERMS, DP_RESPONSES } = require("./defaults");

// Permissões perigosas: percebe quando um cargo ganha uma permissão monitorada
// (ao ser editado ou já criado com ela) e responde conforme o painel.

const bitsOf = (monitored) =>
  monitored.filter((k) => DP_PERMS[k]).map((k) => ({ key: k, bit: PermissionsBitField.Flags[DP_PERMS[k].flag] }));

async function handle(role, cfg, added, auditType) {
  const { guild } = role;
  const d = cfg.dangerPerms;
  if (role.managed || !added.length) return; // cargos de integração/bot são do Discord

  const entry = await findAuditEntry(guild, auditType, (e) => e.targetId === role.id);
  const executorId = entry?.executorId ?? null;
  if (executorId && (await isAuthorized(guild, executorId, { users: d.authorizedUsers, roles: d.authorizedRoles }))) return;

  const response = DP_RESPONSES[d.response] ?? DP_RESPONSES.revert;
  let reverted = "não solicitado";

  if (response.revert) {
    const mask = added.reduce((acc, a) => acc | a.bit, 0n);
    const next = new PermissionsBitField(role.permissions.bitfield & ~mask);
    reverted = await role
      .setPermissions(next, "Anti-Raid: permissão perigosa não autorizada")
      .then(() => "permissão removida do cargo")
      .catch(() => "não consegui editar o cargo (acima do meu?)");
  }

  const punished =
    executorId && response.punish !== "none" ? await punish(guild, executorId, response.punish) : null;

  await sendModuleAlert(guild, cfg, d.alertChannelId, {
    system: "Permissões perigosas",
    action: "Permissão perigosa dada",
    author: executorId,
    color: response.revert ? 0xff0000 : 0xffffff,
    fields: [
      ...(executorId ? [] : [["Autor", "não identificado (falta permissão de auditoria?)"]]),
      ["Cargo", `<@&${role.id}> — ${code(role.name)} (${code(role.id)})`],
      ["Permissões", added.map((a) => DP_PERMS[a.key].label).join(", ")],
      ["Resposta", response.label],
      ["Reversão", reverted],
      ...(punished ? [["Punição", punished]] : []),
    ],
  });
}

async function onRoleUpdate(oldRole, newRole) {
  const cfg = await getAntiRaidConfig(newRole.guild.id);
  if (!cfg.dangerPerms.enabled) return;
  const added = bitsOf(cfg.dangerPerms.monitored).filter(
    (p) => (newRole.permissions.bitfield & p.bit) === p.bit && (oldRole.permissions.bitfield & p.bit) !== p.bit
  );
  await handle(newRole, cfg, added, AuditLogEvent.RoleUpdate);
}

async function onRoleCreate(role) {
  const cfg = await getAntiRaidConfig(role.guild.id);
  if (!cfg.dangerPerms.enabled) return;
  const added = bitsOf(cfg.dangerPerms.monitored).filter((p) => (role.permissions.bitfield & p.bit) === p.bit);
  await handle(role, cfg, added, AuditLogEvent.RoleCreate);
}

module.exports = { onRoleUpdate, onRoleCreate };
