const { ContainerBuilder, RoleSelectMenuBuilder } = require("discord.js");
const { ui } = require("./antiraid");
const { helpers } = require("./antiraidModules");
const access = require("./antiraidAccess");
const D = require("../utils/antiraid/defaults");

// Painéis da parte 4: Permissões perigosas, Cargos protegidos e Mov call.
const { COLOR, text, divider, btn, row } = ui;
const { pickOne, pickMany, nums, toggleSection, alertPick } = helpers;
const { userPick, rolePick } = access.helpers;

const accent = (on) => (on ? COLOR.on : COLOR.off);
const footer = (container) => container.addSeparatorComponents(divider()).addActionRowComponents(row(btn("ar:hub", "Voltar")));

// ======================= Permissões perigosas =======================

function buildDangerPermsPanel(guild, cfg) {
  const d = cfg.dangerPerms;

  const container = new ContainerBuilder()
    .setAccentColor(accent(d.enabled))
    .addTextDisplayComponents(
      text("### Permissões perigosas"),
      text("-# Vigia cargos que ganham uma permissão sensível, seja ao editar o cargo ou ao criá-lo já com ela.")
    )
    .addSeparatorComponents(divider());

  container.addSectionComponents(
    toggleSection("ar:dp:toggle", "Vigilância", "Liga ou desliga o monitoramento de permissões.", d.enabled)
  );

  container.addTextDisplayComponents(text("**Permissões monitoradas**\n-# Só estas permissões disparam a proteção."));
  container.addActionRowComponents(
    pickMany(
      "ar:dp:monitored",
      "Escolha as permissões",
      Object.fromEntries(Object.entries(D.DP_PERMS).map(([k, v]) => [k, v.label])),
      d.monitored
    )
  );

  container.addTextDisplayComponents(text("**Resposta**\n-# Vale para quem não estiver na lista de autorizados."));
  container.addActionRowComponents(
    pickOne(
      "ar:dp:response",
      "O que fazer",
      Object.entries(D.DP_RESPONSES).map(([value, i]) => ({ label: i.label, description: i.desc, value })),
      d.response
    )
  );

  container.addSeparatorComponents(divider());
  container.addTextDisplayComponents(
    text("**Autorizados**\n-# Podem mexer nessas permissões sem acionar a proteção. O dono e o próprio bot já são autorizados.")
  );
  container.addActionRowComponents(
    userPick("ar:dp:users", "Pessoas autorizadas", d.authorizedUsers),
    rolePick("ar:dp:roles", "Cargos autorizados", guild, d.authorizedRoles)
  );

  container.addTextDisplayComponents(text("**Canal de alertas**\n-# Vazio usa o canal do núcleo."));
  container.addActionRowComponents(alertPick("ar:dp:alert", guild, d.alertChannelId));

  footer(container);
  return [container];
}

// ======================= Cargos protegidos =======================

function buildProtectedRolesPanel(guild, cfg) {
  const p = cfg.protectedRoles;

  const container = new ContainerBuilder()
    .setAccentColor(accent(p.enabled))
    .addTextDisplayComponents(
      text("### Cargos protegidos"),
      text("-# Se alguém sem autorização entregar um cargo protegido, o cargo é tirado de volta. Bots que entregam cargos precisam estar nas pessoas autorizadas.")
    )
    .addSeparatorComponents(divider());

  container.addSectionComponents(
    toggleSection("ar:pr:toggle", "Proteção", "Liga ou desliga a proteção dos cargos escolhidos.", p.enabled)
  );

  container.addTextDisplayComponents(text("**Cargos protegidos**"));
  const protectedSelect = new RoleSelectMenuBuilder()
    .setCustomId("ar:pr:roles")
    .setPlaceholder("Escolha os cargos protegidos")
    .setMinValues(0)
    .setMaxValues(25);
  const valid = p.roles.filter((id) => guild.roles.cache.has(id)).slice(0, 25);
  if (valid.length) protectedSelect.setDefaultRoles(...valid);
  container.addActionRowComponents(row(protectedSelect));

  container.addTextDisplayComponents(text("**Punição de quem entregar sem autorização**\n-# O cargo sempre é tirado de volta."));
  container.addActionRowComponents(
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

  container.addSeparatorComponents(divider());
  container.addTextDisplayComponents(
    text("**Autorizados a entregar**\n-# O dono e o próprio bot já podem. Entregas feitas pela própria pessoa (Onboarding) são ignoradas.")
  );
  container.addActionRowComponents(
    rolePick("ar:pr:aroles", "Cargos autorizados", guild, p.authorizedRoles),
    userPick("ar:pr:ausers", "Pessoas ou bots autorizados", p.authorizedUsers)
  );

  container.addTextDisplayComponents(text("**Canal de alertas**\n-# Vazio usa o canal do núcleo."));
  container.addActionRowComponents(alertPick("ar:pr:alert", guild, p.alertChannelId));

  footer(container);
  return [container];
}

// ======================= Mov call =======================

function buildMovCallPanel(guild, cfg) {
  const m = cfg.movCall;

  const container = new ContainerBuilder()
    .setAccentColor(accent(m.enabled))
    .addTextDisplayComponents(
      text("### Mov call"),
      text("-# Pune quem move ou desconecta muitos membros de calls em pouco tempo. O bot não consegue desfazer a movimentação, só reagir ao autor.")
    )
    .addSeparatorComponents(divider());

  container.addSectionComponents(
    toggleSection("ar:mv:toggle", "Proteção", "Liga ou desliga o controle de movimentação.", m.enabled)
  );

  container.addTextDisplayComponents(text("**Ações monitoradas**"));
  container.addActionRowComponents(pickMany("ar:mv:actions", "Escolha as ações", D.MV_ACTIONS, m.actions));

  container.addTextDisplayComponents(
    text(`**Gatilho**\n-# **${m.limit}** membros movidos ou desconectados em **${m.windowSec}s**.`)
  );
  container.addActionRowComponents(
    pickOne("ar:mv:limit", "Quantidade de membros", nums(D.MV_LIMITS, (n) => `${n} membros`), m.limit),
    pickOne("ar:mv:window", "Janela de tempo", nums(D.MV_WINDOWS, (n) => `em ${n} segundos`), m.windowSec)
  );

  container.addTextDisplayComponents(text("**Punição do autor**"));
  container.addActionRowComponents(
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

  container.addSeparatorComponents(divider());
  container.addTextDisplayComponents(text("**Isentos**\n-# O dono e o próprio bot já são isentos."));
  container.addActionRowComponents(
    userPick("ar:mv:xusers", "Pessoas isentas", m.exemptUsers),
    rolePick("ar:mv:xroles", "Cargos isentos", guild, m.exemptRoles)
  );

  container.addTextDisplayComponents(text("**Canal de alertas**\n-# Vazio usa o canal do núcleo."));
  container.addActionRowComponents(alertPick("ar:mv:alert", guild, m.alertChannelId));

  footer(container);
  return [container];
}

module.exports = { buildDangerPermsPanel, buildProtectedRolesPanel, buildMovCallPanel };
