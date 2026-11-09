const { RoleSelectMenuBuilder } = require("discord.js");
const { ui } = require("./antiraid");
const { helpers } = require("./antiraidModules");
const access = require("./antiraidAccess");
const D = require("../utils/antiraid/defaults");

// Painéis da parte 4: Permissões perigosas, Cargos protegidos e Mov call.
const { text, row, tag, box, header, backRow, toggleBtn } = ui;
const { pickOne, pickMany, nums, alertPick } = helpers;
const { userPick, rolePick } = access.helpers;

// ======================= Permissões perigosas =======================

function buildDangerPermsPanel(guild, cfg) {
  const d = cfg.dangerPerms;

  const estado = box()
    .addTextDisplayComponents(
      text(
        [
          "### Vigilância",
          "-# Vigia cargos que ganham uma permissão sensível, seja ao editar o cargo ou ao criá-lo já com ela.",
          `**Monitoramento de permissões**  ${tag(d.enabled)}`,
        ].join("\n")
      )
    )
    .addActionRowComponents(row(toggleBtn("ar:dp:toggle", d.enabled)));

  const monitoradas = box()
    .addTextDisplayComponents(text("### Permissões monitoradas\n-# Só estas permissões disparam a proteção."))
    .addActionRowComponents(
      pickMany(
        "ar:dp:monitored",
        "Escolha as permissões",
        Object.fromEntries(Object.entries(D.DP_PERMS).map(([k, v]) => [k, v.label])),
        d.monitored
      )
    );

  const resposta = box()
    .addTextDisplayComponents(text("### Resposta\n-# Vale para quem não estiver na lista de autorizados."))
    .addActionRowComponents(
      pickOne(
        "ar:dp:response",
        "O que fazer",
        Object.entries(D.DP_RESPONSES).map(([value, i]) => ({ label: i.label, description: i.desc, value })),
        d.response
      )
    );

  const autorizados = box()
    .addTextDisplayComponents(
      text("### Autorizados\n-# Podem mexer nessas permissões sem acionar a proteção. O dono e o próprio bot já são autorizados.")
    )
    .addActionRowComponents(
      userPick("ar:dp:users", "Pessoas autorizadas", d.authorizedUsers),
      rolePick("ar:dp:roles", "Cargos autorizados", guild, d.authorizedRoles)
    );

  const alertas = box()
    .addTextDisplayComponents(text("### Canal de alertas\n-# Vazio usa o canal do núcleo."))
    .addActionRowComponents(alertPick("ar:dp:alert", guild, d.alertChannelId));

  return [header("Permissões perigosas", "Permissões perigosas"), estado, monitoradas, resposta, autorizados, alertas, backRow()];
}

// ======================= Cargos protegidos =======================

function buildProtectedRolesPanel(guild, cfg) {
  const p = cfg.protectedRoles;

  const estado = box()
    .addTextDisplayComponents(
      text(
        [
          "### Proteção",
          "-# Se alguém sem autorização entregar um cargo protegido, o cargo é tirado de volta. Bots que entregam cargos precisam estar nas pessoas autorizadas.",
          `**Proteção dos cargos escolhidos**  ${tag(p.enabled)}`,
        ].join("\n")
      )
    )
    .addActionRowComponents(row(toggleBtn("ar:pr:toggle", p.enabled)));

  const protectedSelect = new RoleSelectMenuBuilder()
    .setCustomId("ar:pr:roles")
    .setPlaceholder("Escolha os cargos protegidos")
    .setMinValues(0)
    .setMaxValues(25);
  const valid = p.roles.filter((id) => guild.roles.cache.has(id)).slice(0, 25);
  if (valid.length) protectedSelect.setDefaultRoles(...valid);

  const cargos = box()
    .addTextDisplayComponents(text("### Cargos protegidos\n-# Estes cargos só podem ser entregues por quem estiver autorizado."))
    .addActionRowComponents(row(protectedSelect));

  const punicao = box()
    .addTextDisplayComponents(text("### Punição de quem entregar sem autorização\n-# O cargo sempre é tirado de volta."))
    .addActionRowComponents(
      pickOne(
        "ar:pr:punish",
        "Punição",
        Object.entries(D.PUNISHMENTS).map(([value, i]) => ({
          label: value === "none" ? "Só reverter" : i.label,
          description: value === "none" ? "Não pune o autor." : i.desc,
          value,
        })),
        p.punishment
      )
    );

  const autorizados = box()
    .addTextDisplayComponents(
      text("### Autorizados a entregar\n-# O dono e o próprio bot já podem. Entregas feitas pela própria pessoa (Onboarding) são ignoradas.")
    )
    .addActionRowComponents(
      rolePick("ar:pr:aroles", "Cargos autorizados", guild, p.authorizedRoles),
      userPick("ar:pr:ausers", "Pessoas ou bots autorizados", p.authorizedUsers)
    );

  const alertas = box()
    .addTextDisplayComponents(text("### Canal de alertas\n-# Vazio usa o canal do núcleo."))
    .addActionRowComponents(alertPick("ar:pr:alert", guild, p.alertChannelId));

  return [header("Cargos protegidos", "Cargos protegidos"), estado, cargos, punicao, autorizados, alertas, backRow()];
}

// ======================= Mov call =======================

function buildMovCallPanel(guild, cfg) {
  const m = cfg.movCall;

  const estado = box()
    .addTextDisplayComponents(
      text(
        [
          "### Proteção",
          "-# Pune quem move ou desconecta muitos membros de calls em pouco tempo. O bot não consegue desfazer a movimentação, só reagir ao autor.",
          `**Controle de movimentação**  ${tag(m.enabled)}`,
        ].join("\n")
      )
    )
    .addActionRowComponents(row(toggleBtn("ar:mv:toggle", m.enabled)));

  const gatilho = box()
    .addTextDisplayComponents(
      text(`### Gatilho\n-# **${m.limit}** membros movidos ou desconectados em **${m.windowSec}s**. Escolha também quais ações contam.`)
    )
    .addActionRowComponents(
      pickMany("ar:mv:actions", "Ações monitoradas", D.MV_ACTIONS, m.actions),
      pickOne("ar:mv:limit", "Quantidade de membros", nums(D.MV_LIMITS, (n) => `${n} membros`), m.limit),
      pickOne("ar:mv:window", "Janela de tempo", nums(D.MV_WINDOWS, (n) => `em ${n} segundos`), m.windowSec)
    );

  const punicao = box()
    .addTextDisplayComponents(text("### Punição do autor"))
    .addActionRowComponents(
      pickOne(
        "ar:mv:punish",
        "Punição",
        Object.entries(D.PUNISHMENTS).map(([value, i]) => ({
          label: value === "none" ? "Só avisar" : i.label,
          description: value === "none" ? "Registra no canal de alertas e não pune." : i.desc,
          value,
        })),
        m.punishment
      )
    );

  const isentos = box()
    .addTextDisplayComponents(text("### Isentos\n-# O dono e o próprio bot já são isentos."))
    .addActionRowComponents(
      userPick("ar:mv:xusers", "Pessoas isentas", m.exemptUsers),
      rolePick("ar:mv:xroles", "Cargos isentos", guild, m.exemptRoles)
    );

  const alertas = box()
    .addTextDisplayComponents(text("### Canal de alertas\n-# Vazio usa o canal do núcleo."))
    .addActionRowComponents(alertPick("ar:mv:alert", guild, m.alertChannelId));

  return [header("Mov call", "Mov call"), estado, gatilho, punicao, isentos, alertas, backRow()];
}

module.exports = { buildDangerPermsPanel, buildProtectedRolesPanel, buildMovCallPanel };
