const { UserSelectMenuBuilder, RoleSelectMenuBuilder } = require("discord.js");
const { ui } = require("./antiraid");
const { helpers } = require("./antiraidModules");
const D = require("../utils/antiraid/defaults");

// Painéis da parte 3: Anti-bot e Anti-alt.
const { text, row, box, header, backRow, flagBtn } = ui;
const { pickOne, nums, alertPick } = helpers;

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

  const modo = box()
    .addTextDisplayComponents(
      text("### Modo de proteção\n-# Controla os bots que entram no servidor e pode punir quem os adicionou. Lê quem adicionou pelo registro de auditoria.")
    )
    .addActionRowComponents(pickOne("ar:ab:mode", "Escolha o modo", withDesc(D.AB_MODES), b.mode));

  const resposta = box()
    .addTextDisplayComponents(text("### Resposta\n-# O que fazer com o bot barrado e com quem o adicionou."))
    .addActionRowComponents(
      pickOne("ar:ab:action", "Ação contra o bot", withDesc(D.AB_ACTIONS), b.action),
      pickOne(
        "ar:ab:inviter",
        "Punição de quem adicionou",
        Object.entries(D.PUNISHMENTS).map(([value, i]) => ({ label: i.label, description: i.desc, value })),
        b.inviterAction
      )
    );

  const liberados = box()
    .addTextDisplayComponents(text("### Bots liberados\n-# Estes bots sempre podem entrar, em qualquer modo."))
    .addActionRowComponents(userPick("ar:ab:allowed", "Escolha os bots liberados", b.allowedBots));

  const confianca = box()
    .addTextDisplayComponents(
      text("### Quem pode adicionar bots\n-# O dono do servidor já pode. Bots adicionados por estes passam sem ser barrados.")
    )
    .addActionRowComponents(
      userPick("ar:ab:tusers", "Pessoas de confiança", b.trustedUsers),
      rolePick("ar:ab:troles", "Cargos de confiança", guild, b.trustedRoles)
    );

  const alertas = box()
    .addTextDisplayComponents(text("### Canal de alertas\n-# Vazio usa o canal do núcleo."))
    .addActionRowComponents(alertPick("ar:ab:alert", guild, b.alertChannelId));

  return [header("Anti-bot", "Anti-bot"), modo, resposta, liberados, confianca, alertas, backRow()];
}

// ======================= Anti-alt =======================

function buildAntiAltPanel(guild, cfg) {
  const a = cfg.antiAlt;
  const off = !a.minAgeDays;

  const idade = box()
    .addTextDisplayComponents(
      text(
        `### Idade mínima da conta\n-# Barra contas muito novas na entrada. Funciona separado do filtro de contas novas da Portaria.\n${
          off ? "Desligado: contas de qualquer idade podem entrar." : `Contas com menos de **${a.minAgeDays} dia(s)** são barradas.`
        }`
      )
    )
    .addActionRowComponents(pickOne("ar:aa:age", "Idade mínima", nums(D.AA_AGES, (n) => (n === 0 ? "Desligado" : `${n} dia(s)`)), a.minAgeDays));

  const resposta = box()
    .addTextDisplayComponents(
      text(`### Resposta\n-# O que fazer com a conta barrada.\n**Avisar na DM**  \`${a.notifyDm ? "Sim" : "Não"}\`  ·  explica o motivo antes de agir`)
    )
    .addActionRowComponents(
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
      ),
      row(flagBtn("ar:aa:dm", "Avisar na DM", a.notifyDm))
    );

  const isentos = box()
    .addTextDisplayComponents(text("### Pessoas isentas\n-# Estas contas entram mesmo sendo novas."))
    .addActionRowComponents(userPick("ar:aa:xusers", "Pessoas isentas", a.exemptUsers));

  const alertas = box()
    .addTextDisplayComponents(text("### Canal de alertas\n-# Vazio usa o canal do núcleo."))
    .addActionRowComponents(alertPick("ar:aa:alert", guild, a.alertChannelId));

  return [header("Anti-alt", "Anti-alt"), idade, resposta, isentos, alertas, backRow()];
}

module.exports = { buildAntiBotPanel, buildAntiAltPanel, helpers: { userPick, rolePick } };
