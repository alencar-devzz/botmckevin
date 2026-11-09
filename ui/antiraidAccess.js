const {
  ContainerBuilder,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
} = require("discord.js");
const { ui } = require("./antiraid");
const { helpers } = require("./antiraidModules");
const D = require("../utils/antiraid/defaults");

// Painéis da parte 3: Anti-bot e Anti-alt.
const { COLOR, text, divider, btn, row } = ui;
const { pickOne, nums, flagSection, alertPick } = helpers;

const withDesc = (map) => Object.entries(map).map(([value, i]) => ({ label: i.label, description: i.desc, value }));

function userPick(id, placeholder, ids, max = 25) {
  const select = new UserSelectMenuBuilder().setCustomId(id).setPlaceholder(placeholder).setMinValues(0).setMaxValues(max);
  if (ids.length) select.setDefaultUsers(...ids.slice(0, max));
  return row(select);
}

function rolePick(id, placeholder, guild, ids) {
  const select = new RoleSelectMenuBuilder().setCustomId(id).setPlaceholder(placeholder).setMinValues(0).setMaxValues(25);
  const valid = ids.filter((r) => guild.roles.cache.has(r)).slice(0, 25);
  if (valid.length) select.setDefaultRoles(...valid);
  return row(select);
}

// ======================= Anti-bot =======================

function buildAntiBotPanel(guild, cfg) {
  const b = cfg.antiBot;

  const container = new ContainerBuilder()
    .setAccentColor(b.mode === "off" ? COLOR.off : COLOR.on)
    .addTextDisplayComponents(
      text("### Anti-bot"),
      text("-# Controla os bots que entram no servidor e pode punir quem os adicionou. Lê quem adicionou pelo registro de auditoria.")
    )
    .addSeparatorComponents(divider());

  container.addTextDisplayComponents(text("**Modo de proteção**"));
  container.addActionRowComponents(pickOne("ar:ab:mode", "Escolha o modo", withDesc(D.AB_MODES), b.mode));

  container.addTextDisplayComponents(text("**Resposta**\n-# O que fazer com o bot barrado e com quem o adicionou."));
  container.addActionRowComponents(
    pickOne("ar:ab:action", "Ação contra o bot", withDesc(D.AB_ACTIONS), b.action),
    pickOne(
      "ar:ab:inviter",
      "Punição de quem adicionou",
      Object.entries(D.PUNISHMENTS).map(([value, i]) => ({ label: i.label, description: i.desc, value })),
      b.inviterAction
    )
  );

  container.addSeparatorComponents(divider());
  container.addTextDisplayComponents(text("**Bots liberados**\n-# Estes bots sempre podem entrar, em qualquer modo."));
  container.addActionRowComponents(userPick("ar:ab:allowed", "Escolha os bots liberados", b.allowedBots));

  container.addTextDisplayComponents(text("**Quem pode adicionar bots**\n-# O dono do servidor já pode. Bots adicionados por estes passam sem ser barrados."));
  container.addActionRowComponents(
    userPick("ar:ab:tusers", "Pessoas de confiança", b.trustedUsers),
    rolePick("ar:ab:troles", "Cargos de confiança", guild, b.trustedRoles)
  );

  container.addTextDisplayComponents(text("**Canal de alertas**\n-# Vazio usa o canal do núcleo."));
  container.addActionRowComponents(alertPick("ar:ab:alert", guild, b.alertChannelId));

  container.addSeparatorComponents(divider());
  container.addActionRowComponents(row(btn("ar:hub", "Voltar")));
  return [container];
}

// ======================= Anti-alt =======================

function buildAntiAltPanel(guild, cfg) {
  const a = cfg.antiAlt;
  const off = !a.minAgeDays;

  const container = new ContainerBuilder()
    .setAccentColor(off ? COLOR.off : COLOR.on)
    .addTextDisplayComponents(
      text("### Anti-alt"),
      text("-# Barra contas muito novas na entrada. Funciona separado do filtro de contas novas da Portaria.")
    )
    .addSeparatorComponents(divider());

  container.addTextDisplayComponents(
    text(`**Idade mínima da conta**\n-# ${off ? "Desligado: contas de qualquer idade podem entrar." : `Contas com menos de **${a.minAgeDays} dia(s)** são barradas.`}`)
  );
  container.addActionRowComponents(
    pickOne("ar:aa:age", "Idade mínima", nums(D.AA_AGES, (n) => (n === 0 ? "Desligado" : `${n} dia(s)`)), a.minAgeDays)
  );

  container.addTextDisplayComponents(text("**Resposta**"));
  container.addActionRowComponents(
    pickOne(
      "ar:aa:response",
      "O que fazer com a conta",
      Object.entries(D.AA_RESPONSES).map(([value, i]) => ({ label: i.label, description: i.desc, value })),
      a.response
    ),
    pickOne(
      "ar:aa:banmin",
      "Duração do banimento temporário",
      nums(D.AA_BAN_MIN, (n) => (n >= 1440 ? "1 dia" : n >= 60 ? `${n / 60} hora(s)` : `${n} minutos`)),
      a.banMin
    )
  );
  container.addSectionComponents(
    flagSection("ar:aa:dm", "Avisar na DM", "Manda uma mensagem explicando o motivo antes de agir.", a.notifyDm)
  );

  container.addSeparatorComponents(divider());
  container.addTextDisplayComponents(text("**Pessoas isentas**\n-# Estas contas entram mesmo sendo novas."));
  container.addActionRowComponents(userPick("ar:aa:xusers", "Pessoas isentas", a.exemptUsers));

  container.addTextDisplayComponents(text("**Canal de alertas**\n-# Vazio usa o canal do núcleo."));
  container.addActionRowComponents(alertPick("ar:aa:alert", guild, a.alertChannelId));

  container.addSeparatorComponents(divider());
  container.addActionRowComponents(row(btn("ar:hub", "Voltar")));
  return [container];
}

module.exports = { buildAntiBotPanel, buildAntiAltPanel, helpers: { userPick, rolePick } };
