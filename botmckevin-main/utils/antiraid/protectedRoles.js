const { AuditLogEvent } = require("discord.js");
const { getAntiRaidConfig } = require("./store");
const { sendModuleAlert, code } = require("./alert");
const { findAuditEntry, isAuthorized } = require("./audit");
const { punish } = require("./engine");
const { PUNISHMENTS } = require("./defaults");

// Cargos protegidos: se alguém sem autorização entrega um cargo protegido, o cargo é
// tirado de volta e o autor pode ser punido. Entregas feitas pela própria pessoa
// (como o Onboarding) são ignoradas.

async function onMemberUpdate(oldMember, newMember) {
  if (oldMember.partial) return; // sem o estado anterior não dá para saber o que mudou
  const { guild } = newMember;
  const cfg = await getAntiRaidConfig(guild.id);
  const p = cfg.protectedRoles;
  if (!p.enabled || !p.roles.length) return;

  const added = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id) && p.roles.includes(r.id));
  if (!added.size) return;

  const entry = await findAuditEntry(
    guild,
    AuditLogEvent.MemberRoleUpdate,
    (e) =>
      e.targetId === newMember.id &&
      e.changes?.some((c) => c.key === "$add" && c.new?.some((r) => added.has(r.id)))
  );
  const executorId = entry?.executorId;
  if (!executorId || executorId === newMember.id) return; // Onboarding, autoatribuição ou sem auditoria

  if (await isAuthorized(guild, executorId, { users: p.authorizedUsers, roles: p.authorizedRoles })) return;

  const reverted = await newMember.roles
    .remove([...added.keys()], "Anti-Raid: cargo protegido entregue sem autorização")
    .then(() => "cargo removido de volta")
    .catch(() => "não consegui remover o cargo (acima do meu?)");

  const punished = p.punishment !== "none" ? await punish(guild, executorId, p.punishment) : null;

  await sendModuleAlert(guild, cfg, p.alertChannelId, {
    system: "Cargos protegidos",
    action: "Cargo protegido entregue",
    author: executorId,
    color: 0xff0000,
    fields: [
      ["Cargo(s)", [...added.keys()].map((id) => `<@&${id}>`).join(" ")],
      ["Entregue a", `<@${newMember.id}> — ${code(newMember.user.username)} (${code(newMember.id)})`],
      ["Reversão", reverted],
      [`Punição (${PUNISHMENTS[p.punishment].label})`, punished ?? "nenhuma"],
    ],
  });
}

module.exports = { onMemberUpdate };
