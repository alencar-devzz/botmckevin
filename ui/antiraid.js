const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelType,
} = require("discord.js");
const { CORE_ACTIONS, CORE_LIMITS, CORE_WINDOWS, PUNISHMENTS, MODULES } = require("../utils/antiraid/defaults");

// Painéis do Anti-Raid (comando painelps). Tudo em Components V2, sem modais.
// IDs dos componentes: "ar:<área>:<ação>"

const COLOR = { on: 0x3ba55d, test: 0xfaa61a, off: 0xed4245, neutral: 0x5865f2 };

const text = (content) => new TextDisplayBuilder().setContent(String(content).slice(0, 3000));
const clip = (value, max) => String(value ?? "").slice(0, max);
const divider = () => new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small);
const btn = (id, label, style = ButtonStyle.Secondary) =>
  new ButtonBuilder().setCustomId(id).setLabel(clip(label, 80)).setStyle(style);
const row = (component) => new ActionRowBuilder().addComponents(component);

const tag = (on) => (on ? "`ATIVO`" : "`DESLIGADO`");
const modeLabel = (mode) => (mode === "live" ? "punição real" : "modo teste");

function coreAccent(core) {
  if (!core.enabled) return COLOR.off;
  return core.mode === "live" ? COLOR.on : COLOR.test;
}

// ---------- Aviso simples ----------
function buildNotice(content) {
  return [new ContainerBuilder().setAccentColor(COLOR.neutral).addTextDisplayComponents(text(content))];
}

// ---------- Painel compacto (mensagem do comando) ----------
function buildAntiRaidHome(guild, cfg) {
  const { core } = cfg;
  const activeModules = MODULES.filter((m) => m.key !== "core" && m.active(cfg)).length;
  const totalModules = MODULES.length - 1;

  const container = new ContainerBuilder()
    .setAccentColor(coreAccent(core))
    .addTextDisplayComponents(
      text("## Anti-Raid"),
      text(`-# Proteção de **${clip(guild.name, 60)}** · central de configuração`)
    )
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(
      text(
        [
          `**Estado do núcleo**  ${tag(core.enabled)}`,
          `**Resposta**  ${modeLabel(core.mode)}`,
          `**Limite**  ${core.limit} ações em ${core.windowSec}s`,
          `**Alertas**  ${core.alertChannelId ? `<#${core.alertChannelId}>` : "sem canal definido"}`,
          `**Módulos extras ligados**  ${activeModules} de ${totalModules}`,
        ].join("\n")
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        btn("ar:open", "Abrir configurações", ButtonStyle.Primary),
        btn("ar:home:refresh", "Atualizar")
      )
    );

  return [container];
}

// ---------- Menu geral (lista de módulos) ----------
function buildAntiRaidHub(guild, cfg) {
  const container = new ContainerBuilder()
    .setAccentColor(COLOR.neutral)
    .addTextDisplayComponents(
      text("### Central de módulos"),
      text("-# Escolha o que você quer configurar. Cada módulo tem o seu próprio painel.")
    )
    .addSeparatorComponents(divider());

  for (const mod of MODULES) {
    const status = mod.built ? (mod.active(cfg) ? "ativo" : "desligado") : "chega nas próximas partes";
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(text(`**${mod.label}**\n-# ${status} · ${mod.desc}`))
        .setButtonAccessory(
          mod.built
            ? btn(`ar:mod:${mod.key}`, "Configurar", ButtonStyle.Primary)
            : btn(`ar:mod:${mod.key}`, "Em breve").setDisabled(true)
        )
    );
  }

  container.addSeparatorComponents(divider());
  container.addActionRowComponents(row(btn("ar:close", "Fechar")));
  return [container];
}

// ---------- Núcleo ----------
function buildCorePanel(guild, cfg) {
  const { core } = cfg;

  const container = new ContainerBuilder()
    .setAccentColor(coreAccent(core))
    .addTextDisplayComponents(
      text("### Núcleo anti-raid"),
      text("-# Lê o registro de auditoria e age quando uma mesma pessoa ou bot faz muitas ações seguidas.")
    )
    .addSeparatorComponents(divider());

  // Liga/desliga
  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(text(`**Proteção**  ${tag(core.enabled)}\n-# Liga ou desliga todo o núcleo.`))
      .setButtonAccessory(
        core.enabled
          ? btn("ar:core:toggle", "Desligar", ButtonStyle.Danger)
          : btn("ar:core:toggle", "Ligar", ButtonStyle.Success)
      )
  );

  // Modo
  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        text(
          `**Modo de resposta**  \`${core.mode === "live" ? "PUNIÇÃO REAL" : "TESTE"}\`\n-# ${
            core.mode === "live"
              ? "Quem passar do limite é punido de verdade."
              : "Só registra e avisa no canal de alertas, sem punir ninguém."
          }`
        )
      )
      .setButtonAccessory(
        core.mode === "live"
          ? btn("ar:core:mode", "Voltar ao teste")
          : btn("ar:core:mode", "Punir de verdade", ButtonStyle.Danger)
      )
  );

  container.addSeparatorComponents(divider());

  // Ações monitoradas
  container.addTextDisplayComponents(text("**Ações monitoradas**\n-# O que conta para o limite. Cada ação é contada separadamente."));
  container.addActionRowComponents(
    row(
      new StringSelectMenuBuilder()
        .setCustomId("ar:core:actions")
        .setPlaceholder("Escolha as ações")
        .setMinValues(0)
        .setMaxValues(Object.keys(CORE_ACTIONS).length)
        .addOptions(
          Object.entries(CORE_ACTIONS).map(([value, label]) => ({
            label,
            value,
            default: core.actions.includes(value),
          }))
        )
    )
  );

  // Limite e janela
  container.addTextDisplayComponents(
    text(`**Gatilho**\n-# Dispara com **${core.limit}** ações dentro de **${core.windowSec}s**.`)
  );
  container.addActionRowComponents(
    row(
      new StringSelectMenuBuilder()
        .setCustomId("ar:core:limit")
        .setPlaceholder("Quantidade de ações")
        .addOptions(
          CORE_LIMITS.map((n) => ({ label: `${n} ações`, value: String(n), default: n === core.limit }))
        )
    )
  );
  container.addActionRowComponents(
    row(
      new StringSelectMenuBuilder()
        .setCustomId("ar:core:window")
        .setPlaceholder("Janela de tempo")
        .addOptions(
          CORE_WINDOWS.map((n) => ({ label: `em ${n} segundos`, value: String(n), default: n === core.windowSec }))
        )
    )
  );

  // Punição
  container.addTextDisplayComponents(text("**Punição de quem passar do limite**"));
  container.addActionRowComponents(
    row(
      new StringSelectMenuBuilder()
        .setCustomId("ar:core:punish")
        .setPlaceholder("Escolha a punição")
        .addOptions(
          Object.entries(PUNISHMENTS).map(([value, info]) => ({
            label: info.label,
            description: info.desc,
            value,
            default: core.punishment === value,
          }))
        )
    )
  );

  container.addSeparatorComponents(divider());

  // Canal de alertas
  container.addTextDisplayComponents(text("**Canal de alertas**\n-# Esvazie a seleção para remover o canal."));
  const alert = new ChannelSelectMenuBuilder()
    .setCustomId("ar:core:alert")
    .setPlaceholder("Escolha o canal")
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(0)
    .setMaxValues(1);
  if (core.alertChannelId && guild.channels.cache.has(core.alertChannelId)) {
    alert.setDefaultChannels(core.alertChannelId);
  }
  container.addActionRowComponents(row(alert));

  // Isentos
  container.addTextDisplayComponents(text("**Isentos**\n-# Pessoas e cargos que nunca disparam o núcleo. O dono e o próprio bot já são isentos."));
  const users = new UserSelectMenuBuilder()
    .setCustomId("ar:core:xusers")
    .setPlaceholder("Pessoas isentas")
    .setMinValues(0)
    .setMaxValues(25);
  if (core.exemptUsers.length) users.setDefaultUsers(...core.exemptUsers.slice(0, 25));
  container.addActionRowComponents(row(users));

  const exemptRoles = core.exemptRoles.filter((id) => guild.roles.cache.has(id)).slice(0, 25);
  const roles = new RoleSelectMenuBuilder()
    .setCustomId("ar:core:xroles")
    .setPlaceholder("Cargos isentos")
    .setMinValues(0)
    .setMaxValues(25);
  if (exemptRoles.length) roles.setDefaultRoles(...exemptRoles);
  container.addActionRowComponents(row(roles));

  container.addSeparatorComponents(divider());
  container.addActionRowComponents(row(btn("ar:hub", "Voltar")));
  return [container];
}

module.exports = {
  buildAntiRaidHome,
  buildAntiRaidHub,
  buildCorePanel,
  buildNotice,
  ui: { COLOR, text, clip, divider, btn, row, tag },
};
