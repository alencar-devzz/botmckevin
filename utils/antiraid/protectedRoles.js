const { getAntiRaidConfig } = require("./store");
const { sendModuleAlert, code } = require("./alert");
const { isAuthorized } = require("./audit");
const { punish } = require("./engine");
const { PUNISHMENTS } = require("./defaults");

// Cargos protegidos: se alguém sem autorização entrega um cargo protegido, o cargo é
// tirado de volta e o autor pode ser punido. Entregas feitas pela própria pessoa
// (como o Onboarding) são ignoradas.

// Chamado pelo hub (events/antiRaidAudit.js) quando alguém recebe/perde cargos.
// A entrada de auditoria já traz o autor e os cargos adicionados ("$add").
async function onGrantEntry(entry, guild) {
  const executorId = entry.executorId;
  if (!executorId || executorId === entry.targetId) return; // Onboarding, autoatribuição ou sem auditoria

  const cfg = await getAntiRaidConfig(guild.id);
  const p = cfg.protectedRoles;
  if (!p.enabled || !p.roles.length) return;

  const addedIds = (entry.changes ?? [])
    .filter((c) => c.key === "$add")
    .flatMap((c) => (Array.isArray(c.new) ? c.new : []))
    .map((r) => r.id)
    .filter((id) => p.roles.includes(id));
  if (!addedIds.length) return;

  if (await isAuthorized(guild, executorId, { users: p.authorizedUsers, roles: p.authorizedRoles })) return;

  const newMember = guild.members.cache.get(entry.targetId) ?? (await guild.members.fetch(entry.targetId).catch(() => null));
  if (!newMember) return;
  const added = new Map(addedIds.filter((id) => newMember.roles.cache.has(id)).map((id) => [id, true]));
  if (!added.size) return; // o cargo já foi tirado de volta

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

module.exports = { onGrantEntry };
