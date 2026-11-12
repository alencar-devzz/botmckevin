const { getAntiRaidConfig } = require("./store");
const { sendModuleAlert, code } = require("./alert");
const { isAuthorized } = require("./audit");
const { punish } = require("./engine");
const { PUNISHMENTS } = require("./defaults");

// Cargos protegidos: se alguém sem autorização entrega um cargo protegido, o cargo é
// tirado de volta e o autor pode ser punido.
//
// Lê a entrada MemberRoleUpdate do registro de auditoria, que já traz quem entregou, quem recebeu e
// quais cargos. Assim funciona para QUALQUER membro, esteja ou não no cache do bot (o evento
// guildMemberUpdate nem chega para membros fora do cache). Quem entrega um cargo protegido a si mesmo
// também é conferido: só passa se estiver autorizado.
async function onGrantEntry(entry, guild) {
  const cfg = await getAntiRaidConfig(guild.id);
  const p = cfg.protectedRoles;
  if (!p.enabled || !p.roles.length) return;

  const ids = entry.changes?.find((c) => c.key === "$add")?.new?.map((r) => r.id) ?? [];
  const added = ids.filter((id) => p.roles.includes(id));
  if (!added.length) return;

  const executorId = entry.executorId;
  const targetId = entry.targetId;

  // Sem autor no registro: não dá para saber quem foi, mas o alerta sai (nada é revertido às cegas)
  if (!executorId) {
    await sendModuleAlert(guild, cfg, p.alertChannelId, {
      system: "Cargos protegidos",
      action: "Cargo protegido entregue",
      color: 0xfaa61a,
      fields: [
        ["Autor", "não identificado no registro de auditoria"],
        ["Cargo(s)", added.map((id) => `<@&${id}>`).join(" ")],
        ["Entregue a", `<@${targetId}> — ${code(targetId)}`],
        ["Reversão", "não feita (sem autor para conferir a autorização)"],
      ],
    });
    return;
  }

  if (await isAuthorized(guild, executorId, { users: p.authorizedUsers, roles: p.authorizedRoles })) return;

  const member = await guild.members.fetch(targetId).catch(() => null);
  const reverted = !member
    ? "o membro já não está no servidor"
    : await member.roles
        .remove(added, "Anti-Raid: cargo protegido entregue sem autorização")
        .then(() => "cargo removido de volta")
        .catch(() => "não consegui remover o cargo (acima do meu?)");

  const punished = p.punishment !== "none" ? await punish(guild, executorId, p.punishment) : null;

  await sendModuleAlert(guild, cfg, p.alertChannelId, {
    system: "Cargos protegidos",
    action: "Cargo protegido entregue",
    author: executorId,
    color: 0xed4245,
    fields: [
      ["Cargo(s)", added.map((id) => `<@&${id}>`).join(" ")],
      [
        "Entregue a",
        member
          ? `<@${member.id}> — ${code(member.user.username)} (${code(member.id)})${executorId === targetId ? " (a si mesmo)" : ""}`
          : `<@${targetId}> — ${code(targetId)}`,
      ],
      ["Reversão", reverted],
      [`Punição (${PUNISHMENTS[p.punishment].label})`, punished ?? "nenhuma"],
    ],
  });
}

module.exports = { onGrantEntry };
