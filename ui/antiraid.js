const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  ThumbnailBuilder,
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
// Visual: containers sem cor de destaque, vários containers por mensagem e os botões
// numa linha embaixo (nada de botão encostado no lado direito).

const text = (content) => new TextDisplayBuilder().setContent(String(content).slice(0, 3000));
const clip = (value, max) => String(value ?? "").slice(0, max);
const divider = () => new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small);
const btn = (id, label, style = ButtonStyle.Secondary) =>
  new ButtonBuilder().setCustomId(id).setLabel(clip(label, 80)).setStyle(style);
const row = (...components) => new ActionRowBuilder().addComponents(...components);

const tag = (on) => (on ? "`Ligado`" : "`Desligado`");
const modeLabel = (mode) => (mode === "live" ? "punição real" : "modo teste");

// Container sem cor de destaque
const box = () => new ContainerBuilder();

// Cabeçalho padrão dos painéis: só o título (o segundo argumento que alguns painéis ainda passam é ignorado)
function header(title) {
  return box().addTextDisplayComponents(text(`## ${title}`)).addSeparatorComponents(divider());
}

// Botão de liga/desliga e de opção sim/não (ficam sempre numa linha de botões embaixo)
const toggleBtn = (id, on, offLabel = "Ligar", onLabel = "Desligar") =>
  on ? btn(id, onLabel, ButtonStyle.Danger) : btn(id, offLabel, ButtonStyle.Success);
const flagBtn = (id, label, on) => btn(id, `${label}: ${on ? "sim" : "não"}`, on ? ButtonStyle.Success : ButtonStyle.Secondary);

// Linha de botão voltar, solta embaixo dos containers
const backRow = (id = "ar:hub", label = "Voltar") => row(btn(id, label));

// ---------- Aviso simples ----------
function buildNotice(content) {
  return [box().addTextDisplayComponents(text(content))];
}

// ---------- Painel principal (mensagem do comando painelps) ----------
function buildAntiRaidHome(guild, cfg) {
  const { core } = cfg;
  const counted = MODULES.filter((m) => m.key !== "core" && !m.info); // "info" só aplica ajustes, não liga nem desliga
  const activeModules = counted.filter((m) => m.active(cfg)).length;

  // Imagem de canto: ícone do servidor, ou o avatar do bot se o servidor não tiver ícone
  const icon =
    guild.iconURL({ extension: "png", size: 256 }) ?? guild.client.user.displayAvatarURL({ extension: "png", size: 256 });

  const head = box()
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          text("## Anti-Raid"),
          text(`Proteção de **${clip(guild.name, 60)}**\n-# Central de configuração do servidor.`)
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(icon))
    );

  const nucleo = box().addTextDisplayComponents(
    text(
      [
        "### Núcleo",
        `**Estado**  ${tag(core.enabled)}`,
        `**Resposta**  ${modeLabel(core.mode)}`,
        `**Limite**  ${core.limit} ações em ${core.windowSec}s`,
        `**Alertas**  ${core.alertChannelId ? `<#${core.alertChannelId}>` : "sem canal definido"}`,
      ].join("\n")
    )
  );

  const modulos = box().addTextDisplayComponents(
    text(
      [
        `### Módulos  (${activeModules} de ${counted.length} ligados)`,
        ...counted.map((m) => `**${m.label}**  ${tag(m.active(cfg))}`),
      ].join("\n")
    )
  );

  return [head, nucleo, modulos, row(btn("ar:open", "Abrir configurações", ButtonStyle.Primary), btn("ar:home:refresh", "Atualizar").setEmoji({ name: "update", id: "1569724363954065498", animated: true }))];
}

// ---------- Menu geral (módulos agrupados) ----------
const GROUPS = [
  { title: "Base e ajustes", keys: ["core", "native"] },
  { title: "Entrada e mensagens", keys: ["massJoin", "spam", "antiLink"] },
  { title: "Acesso e permissões", keys: ["antiBot", "antiAlt", "dangerPerms", "visual"] },
  { title: "Proteções sensíveis", keys: ["protectedRoles", "movCall"] },
];

function buildAntiRaidHub(guild, cfg) {
  const head = box().addTextDisplayComponents(
    text("## Anti-Raid\n-# Escolha uma proteção em cada grupo para configurar.")
  );
  const containers = [head];

  GROUPS.forEach((group, index) => {
    const mods = group.keys.map((k) => MODULES.find((m) => m.key === k)).filter((m) => m?.built);
    if (!mods.length) return;

    const lines = mods.map((m) => `**${m.label}**  ${m.info ? `\`${m.status ?? "ajustes"}\`` : tag(m.active(cfg))}`);
    containers.push(
      box()
        .addTextDisplayComponents(text([`### ${group.title}`, ...lines].join("\n")))
        .addActionRowComponents(
          row(
            new StringSelectMenuBuilder()
              .setCustomId(`ar:pick:${index}`)
              .setPlaceholder("Escolha uma proteção para configurar")
              .addOptions(mods.map((m) => ({ label: clip(m.label, 100), description: clip(m.desc, 100), value: m.key })))
          )
        )
    );
  });

  containers.push(row(btn("ar:close", "Fechar")));
  return containers;
}

// ---------- Núcleo ----------
function buildCorePanel(guild, cfg) {
  const { core } = cfg;

  const estado = box()
    .addTextDisplayComponents(
      text(
        [
          "### Estado",
          "-# Lê o registro de auditoria e age quando uma mesma pessoa ou bot faz muitas ações seguidas.",
          `**Proteção**  ${tag(core.enabled)}`,
          `**Modo de resposta**  \`${core.mode === "live" ? "Punição real" : "Teste"}\``,
          `-# ${
            core.mode === "live"
              ? "Quem passar do limite é punido de verdade."
              : "Só registra e avisa no canal de alertas, sem punir ninguém."
          }`,
        ].join("\n")
      )
    )
    .addActionRowComponents(
      row(
        toggleBtn("ar:core:toggle", core.enabled),
        core.mode === "live" ? btn("ar:core:mode", "Voltar ao teste") : btn("ar:core:mode", "Punir de verdade", ButtonStyle.Danger)
      )
    );

  const gatilho = box()
    .addTextDisplayComponents(
      text(
        `### Gatilho\n-# Dispara com **${core.limit}** ações dentro de **${core.windowSec}s**. Cada ação é contada separadamente.`
      )
    )
    .addActionRowComponents(
      row(
        new StringSelectMenuBuilder()
          .setCustomId("ar:core:actions")
          .setPlaceholder("Ações monitoradas")
          .setMinValues(0)
          .setMaxValues(Object.keys(CORE_ACTIONS).length)
          .addOptions(
            Object.entries(CORE_ACTIONS).map(([value, label]) => ({ label, value, default: core.actions.includes(value) }))
          )
      ),
      row(
        new StringSelectMenuBuilder()
          .setCustomId("ar:core:limit")
          .setPlaceholder("Quantidade de ações")
          .addOptions(CORE_LIMITS.map((n) => ({ label: `${n} ações`, value: String(n), default: n === core.limit })))
      ),
      row(
        new StringSelectMenuBuilder()
          .setCustomId("ar:core:window")
          .setPlaceholder("Janela de tempo")
          .addOptions(CORE_WINDOWS.map((n) => ({ label: `em ${n} segundos`, value: String(n), default: n === core.windowSec })))
      )
    );

  const alert = new ChannelSelectMenuBuilder()
    .setCustomId("ar:core:alert")
    .setPlaceholder("Canal de alertas")
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(0)
    .setMaxValues(1);
  if (core.alertChannelId && guild.channels.cache.has(core.alertChannelId)) alert.setDefaultChannels(core.alertChannelId);

  const resposta = box()
    .addTextDisplayComponents(text("### Resposta e alertas\n-# Punição de quem passar do limite. Esvazie o canal para remover os alertas."))
    .addActionRowComponents(
      row(
        new StringSelectMenuBuilder()
          .setCustomId("ar:core:punish")
          .setPlaceholder("Punição")
          .addOptions(
            Object.entries(PUNISHMENTS).map(([value, info]) => ({
              label: info.label,
              description: info.desc,
              value,
              default: core.punishment === value,
            }))
          )
      ),
      row(alert)
    );

  const users = new UserSelectMenuBuilder().setCustomId("ar:core:xusers").setPlaceholder("Pessoas isentas").setMinValues(0).setMaxValues(25);
  if (core.exemptUsers.length) users.setDefaultUsers(...core.exemptUsers.slice(0, 25));

  const exemptRoles = core.exemptRoles.filter((id) => guild.roles.cache.has(id)).slice(0, 25);
  const roles = new RoleSelectMenuBuilder().setCustomId("ar:core:xroles").setPlaceholder("Cargos isentos").setMinValues(0).setMaxValues(25);
  if (exemptRoles.length) roles.setDefaultRoles(...exemptRoles);

  const isentos = box()
    .addTextDisplayComponents(text("### Isentos\n-# Pessoas e cargos que nunca disparam o núcleo. O dono e o próprio bot já são isentos."))
    .addActionRowComponents(row(users), row(roles));

  return [header("Núcleo anti-raid", "Núcleo"), estado, gatilho, resposta, isentos, backRow()];
}

module.exports = {
  buildAntiRaidHome,
  buildAntiRaidHub,
  buildCorePanel,
  buildNotice,
  ui: { text, clip, divider, btn, row, tag, box, header, backRow, toggleBtn, flagBtn },
};
