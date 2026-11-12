const { PermissionsBitField } = require("discord.js");
const { getAntiRaidConfig } = require("./store");
const { sendModuleAlert, code } = require("./alert");
const { isAuthorized } = require("./audit");
const { punish } = require("./engine");
const { DP_PERMS, DP_RESPONSES } = require("./defaults");

// Permissões perigosas. Duas vigilâncias, as duas vindas direto do registro de auditoria (sem espera):
//  1) um cargo GANHA uma permissão monitorada (editado, ou já criado com ela);
//  2) alguém ENTREGA a um membro um cargo que já tem uma permissão monitorada
//     (antes isso passava batido: o cargo não mudou, só foi dado a outra pessoa).

const bitsOf = (monitored) =>
  monitored.filter((k) => DP_PERMS[k]).map((k) => ({ key: k, bit: PermissionsBitField.Flags[DP_PERMS[k].flag] }));

const toBig = (value) => {
  try {
    return BigInt(value ?? 0);
  } catch {
    return 0n;
  }
};

// ---------- 1) Cargo ganhou permissão ----------

async function handleRole(role, cfg, added, executorId) {
  const { guild } = role;
  const d = cfg.dangerPerms;
  if (role.managed || !added.length) return; // cargos de integração/bot são do Discord

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
    color: response.revert ? 0xed4245 : 0xfaa61a,
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

// Entrada RoleUpdate / RoleCreate: a mudança de permissões vem na própria entrada (valores antigo e novo)
async function onRoleEntry(entry, guild) {
  const cfg = await getAntiRaidConfig(guild.id);
  if (!cfg.dangerPerms.enabled) return;

  const change = entry.changes?.find((c) => c.key === "permissions");
  if (!change) return; // edição de nome, cor etc.: nada a ver com permissões

  const oldBits = toBig(change.old);
  const newBits = toBig(change.new);
  const added = bitsOf(cfg.dangerPerms.monitored).filter(
    (p) => (newBits & p.bit) === p.bit && (oldBits & p.bit) !== p.bit
  );
  if (!added.length) return;

  const role = guild.roles.cache.get(entry.targetId) ?? (await guild.roles.fetch(entry.targetId).catch(() => null));
  if (!role) return;
  await handleRole(role, cfg, added, entry.executorId ?? null);
}

// ---------- 2) Cargo perigoso entregue a alguém ----------

// Entrada MemberRoleUpdate
async function onGrantEntry(entry, guild) {
  const cfg = await getAntiRaidConfig(guild.id);
  const d = cfg.dangerPerms;
  if (!d.enabled || !d.guardGrants) return;

  const executorId = entry.executorId;
  if (!executorId) return;

  const ids = entry.changes?.find((c) => c.key === "$add")?.new?.map((r) => r.id) ?? [];
  if (!ids.length) return;

  const monitored = bitsOf(d.monitored);
  const dangerous = ids
    .map((id) => guild.roles.cache.get(id))
    .filter((r) => r && !r.managed && monitored.some((p) => r.permissions.has(p.bit)));
  if (!dangerous.length) return;

  if (await isAuthorized(guild, executorId, { users: d.authorizedUsers, roles: d.authorizedRoles })) return;

  const response = DP_RESPONSES[d.response] ?? DP_RESPONSES.revert;
  const target = await guild.members.fetch(entry.targetId).catch(() => null);

  let reverted = "não solicitado";
  if (response.revert) {
    reverted = !target
      ? "o membro já não está no servidor"
      : await target.roles
          .remove(dangerous, "Anti-Raid: cargo com permissão perigosa entregue sem autorização")
          .then(() => "cargo removido de volta")
          .catch(() => "não consegui remover o cargo (acima do meu?)");
  }

  const punished = response.punish !== "none" ? await punish(guild, executorId, response.punish) : null;

  await sendModuleAlert(guild, cfg, d.alertChannelId, {
    system: "Permissões perigosas",
    action: "Cargo perigoso entregue",
    author: executorId,
    color: response.revert ? 0xed4245 : 0xfaa61a,
    fields: [
      ["Cargo(s)", dangerous.map((r) => `<@&${r.id}>`).join(" ")],
      ["Entregue a", `<@${entry.targetId}> — ${code(entry.targetId)}`],
      ["Resposta", response.label],
      ["Reversão", reverted],
      ...(punished ? [["Punição", punished]] : []),
    ],
  });
}

module.exports = { onRoleEntry, onGrantEntry };
