const { AuditLogEvent, PermissionsBitField } = require("discord.js");
const { getAntiRaidConfig } = require("./store");
const { sendModuleAlert, code } = require("./alert");
const { isAuthorized } = require("./audit");
const { punish } = require("./engine");
const { DP_PERMS, DP_RESPONSES } = require("./defaults");

// Permissões perigosas: percebe quando um cargo ganha uma permissão monitorada
// (ao ser editado ou já criado com ela) e responde conforme o painel.

const bitsOf = (monitored) =>
  monitored.filter((k) => DP_PERMS[k]).map((k) => ({ key: k, bit: PermissionsBitField.Flags[DP_PERMS[k].flag] }));

async function handle(role, cfg, added, executorId) {
  const { guild } = role;
  const d = cfg.dangerPerms;
  if (role.managed || !added.length) return; // cargos de integração/bot são do Discord

  executorId = executorId ?? null;
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

// Converte o valor de "permissions" de uma entrada de auditoria (string, número ou PermissionsBitField) em BigInt
function toBits(value) {
  if (value == null) return 0n;
  try {
    return BigInt(typeof value === "object" && "bitfield" in value ? value.bitfield : value);
  } catch {
    return 0n;
  }
}

// Chamado pelo hub (events/antiRaidAudit.js) quando um cargo é criado ou editado.
// A entrada de auditoria já traz o autor e as permissões antes/depois da mudança.
async function onRoleEntry(entry, guild) {
  const change = entry.changes?.find((c) => c.key === "permissions");
  if (!change) return;

  const cfg = await getAntiRaidConfig(guild.id);
  if (!cfg.dangerPerms.enabled) return;

  const oldBits = entry.action === AuditLogEvent.RoleCreate ? 0n : toBits(change.old);
  const newBits = toBits(change.new);
  const added = bitsOf(cfg.dangerPerms.monitored).filter((p) => (newBits & p.bit) === p.bit && (oldBits & p.bit) !== p.bit);
  if (!added.length) return;

  const role = guild.roles.cache.get(entry.targetId) ?? (await guild.roles.fetch(entry.targetId).catch(() => null));
  if (!role) return;

  await handle(role, cfg, added, entry.executorId);
}

module.exports = { onRoleEntry };
