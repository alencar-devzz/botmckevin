const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelType,
  TextInputStyle,
  PermissionFlagsBits,
} = require("discord.js");
const { addBackButton } = require("./backButton");
const { textLabel, selectLabel, modal } = require("./modalHelpers");
const { SECTIONS, DEFAULT_TEXTS, STYLE_LABELS } = require("../utils/callHubDefaults");
const { GROUPS, MESSAGES, DEFAULT_MESSAGES } = require("../utils/callHubMessages");

// Painéis do menu: Comunidade e interação → Gerenciador de calls

const text = (content) => new TextDisplayBuilder().setContent(String(content).slice(0, 3000));
const clip = (value, max) => String(value ?? "").slice(0, max);
const btn = (id, label, style = ButtonStyle.Secondary) =>
  new ButtonBuilder().setCustomId(id).setLabel(clip(label, 80)).setStyle(style);
const yesNo = (value) => (value ? "Sim" : "Não");
const row = (...components) => new ActionRowBuilder().addComponents(...components);

const mentionRoles = (guild, list) => {
  const valid = list.filter((id) => guild.roles.cache.has(id));
  return valid.length ? valid.map((id) => `<@&${id}>`).join(" ") : "`Nenhum`";
};

const NEEDED_PERMS = [
  ["ManageChannels", "Gerenciar Canais"],
  ["ManageRoles", "Gerenciar Cargos"],
  ["MoveMembers", "Mover Membros"],
  ["ViewChannel", "Ver Canais"],
  ["Connect", "Conectar"],
];

function missingPerms(guild) {
  const perms = guild.members.me?.permissions;
  if (!perms) return [];
  return NEEDED_PERMS.filter(([flag]) => !perms.has(PermissionFlagsBits[flag])).map(([, label]) => label);
}

function thumbLabel(value) {
  if (!value) return "ícone do servidor";
  if (value === "none") return "nenhuma";
  return "link personalizado";
}

// ---------- Painel principal ----------

function buildCallHubHome(guild, cfg, prefix) {
  const ignored = cfg.ignoredChannels.filter((id) => guild.channels.cache.has(id));
  const missing = missingPerms(guild);

  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Gerenciador de calls"),
    text("-# Quem estiver em qualquer call de voz do servidor gerencia ela pelo painel. Quem não estiver em uma call recebe um aviso só para ele."),
    text(`-# Sistema: **${cfg.enabled ? "ativado" : "desativado"}**`)
  );

  const status = new ContainerBuilder().addTextDisplayComponents(
    text("**Situação atual**"),
    text(
      [
        "**Funciona em:** qualquer call de voz do servidor, menos as ignoradas",
        `**Calls ignoradas:** ${ignored.length ? ignored.map((id) => `<#${id}>`).join(" ") : "`Nenhuma`"}`,
        `**Quem pode usar:** ${cfg.allowedRoles.length ? mentionRoles(guild, cfg.allowedRoles) : "todos"} · **Bloqueados:** ${mentionRoles(guild, cfg.blockedRoles)}`,
        `**Comando do painel fixo:** \`${prefix}painel\` · **Moderação (envia o painel fixo):** ${mentionRoles(guild, cfg.staffRoles)}`,
        `**Automático:** painel automático ${yesNo(cfg.autoPanel)} · apagar painel ao esvaziar ${yesNo(cfg.autoPanelClean)} · restaurar call ao esvaziar ${yesNo(cfg.resetOnEmpty)}`,
        missing.length ? `**Permissões que faltam ao bot:** ${missing.join(", ")}` : "**Permissões do bot:** tudo certo",
      ].join("\n")
    )
  );

  const ignoredSelect = new ChannelSelectMenuBuilder()
    .setCustomId("chcfg_ignored")
    .setPlaceholder("Calls onde o painel não funciona (opcional)")
    .setChannelTypes(ChannelType.GuildVoice)
    .setMinValues(0)
    .setMaxValues(25);
  if (ignored.length) ignoredSelect.setDefaultChannels(...ignored.slice(0, 25));

  const controls = new ContainerBuilder()
    .addTextDisplayComponents(text("**Ajustes rápidos**"))
    .addActionRowComponents(row(ignoredSelect))
    .addActionRowComponents(
      row(
        btn("chcfg_toggle", cfg.enabled ? "Desativar" : "Ativar", cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
        btn("chcfg_page:access", "Quem pode usar"),
        btn("chcfg_page:look", "Painel da call"),
        btn("chcfg_page:behavior", "Comportamento"),
        btn("chcfg_reset", "Restaurar tudo", ButtonStyle.Danger)
      )
    );
  addBackButton(controls, "back_comunidade");

  return [header, status, controls];
}

// ---------- Cargos e acesso ----------

function roleSelect(id, placeholder, list, guild) {
  const valid = list.filter((roleId) => guild.roles.cache.has(roleId)).slice(0, 25);
  const menu = new RoleSelectMenuBuilder().setCustomId(id).setPlaceholder(placeholder).setMinValues(0).setMaxValues(25);
  if (valid.length) menu.setDefaultRoles(...valid);
  return row(menu);
}

function buildCallHubAccess(guild, cfg) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Quem pode usar"),
    text("-# Quais cargos usam o painel de gerenciamento e quais fazem parte da moderação das calls.")
  );

  const body = new ContainerBuilder()
    .addTextDisplayComponents(
      text("**Quem pode usar o painel**"),
      text("-# Vazio = todos que estiverem em uma call podem. Se escolher cargos, só eles usam. Os bloqueados nunca usam.")
    )
    .addActionRowComponents(roleSelect("chcfg_allowed", "Cargos que podem usar o painel", cfg.allowedRoles, guild))
    .addActionRowComponents(roleSelect("chcfg_blocked", "Cargos que NÃO podem usar o painel", cfg.blockedRoles, guild))
    .addTextDisplayComponents(
      text("**Moderação**"),
      text("-# Esses cargos (e quem tem Administrador) podem enviar o painel fixo com o comando do painel. Os botões do painel valem para quem estiver na call.")
    )
    .addActionRowComponents(roleSelect("chcfg_staff", "Cargos da moderação", cfg.staffRoles, guild));
  body.addSeparatorComponents(new SeparatorBuilder());
  body.addActionRowComponents(row(btn("chcfg_home", "Voltar")));

  return [header, body];
}

// ---------- Aparência do painel ----------

function buildCallHubLook(guild, cfg, prefix) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Painel da call"),
    text(`-# Tudo do painel de gerenciamento é ajustável aqui. Para deixar um painel fixo em um canal use \`${prefix}painel\` (só a moderação).`),
    text(
      `-# Cor lateral: ${cfg.color === null ? "sem cor" : `\`#${cfg.color.toString(16).padStart(6, "0")}\``} · Miniatura: ${thumbLabel(cfg.thumbnail)}`
    )
  );

  const body = new ContainerBuilder()
    .addTextDisplayComponents(
      text("**Textos**"),
      text("-# Título, descrição, rodapé, cor lateral, miniatura, título e descrição de cada seção. Aceita formatação livre (`# título`, `> citação`, `-# pequeno`, `**negrito**`).")
    )
    .addActionRowComponents(
      row(
        btn("chcfg_edit:main", "Título e aparência"),
        btn("chcfg_edit:access", "Acesso e Privacidade"),
        btn("chcfg_edit:members", "Gerenciar Membros"),
        btn("chcfg_edit:tools", "Ferramentas")
      )
    )
    .addTextDisplayComponents(
      text("**Botões**"),
      text("-# Nome, descrição, cor e visibilidade de cada botão, uma janela por botão. Também troca os botões por select menu.")
    )
    .addActionRowComponents(row(btn("chcfg_page:buttons", "Editar botões")))
    .addTextDisplayComponents(
      text("**Mensagens e respostas**"),
      text("-# Todo texto que o painel envia: avisos, seletores, resultados de cada botão, janela do limite e motivos de erro.")
    )
    .addActionRowComponents(row(btn("chcfg_page:messages", "Editar mensagens e respostas")))
    .addTextDisplayComponents(
      text("**Estilo do painel**"),
      text("-# Liga e desliga partes do visual.")
    )
    .addActionRowComponents(
      row(
        btn("chcfg_ui:legend", `Legenda dos botões: ${yesNo(cfg.legend)}`),
        btn("chcfg_ui:dividers", `Divisórias: ${yesNo(cfg.dividers)}`)
      )
    )
    .addActionRowComponents(
      row(btn("chcfg_preview", "Pré-visualizar"), btn("chcfg_reset_ui", "Restaurar aparência", ButtonStyle.Danger))
    );
  body.addSeparatorComponents(new SeparatorBuilder());
  body.addActionRowComponents(row(btn("chcfg_home", "Voltar")));

  return [header, body];
}

// ---------- Comportamento ----------

function buildCallHubBehavior(guild, cfg, log = {}) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Comportamento da call"),
    text("-# O que o gerenciador faz sozinho quando alguém entra ou sai de uma call. Tudo é ajustável aqui, nada fica fixo no código.")
  );

  const logId = log.channelId && guild.channels.cache.has(log.channelId) ? log.channelId : null;
  const logChannel = logId ? `<#${logId}>` : "`Nenhum`";
  const secs = (n, none) => (n ? `\`${n}s\`` : none);

  const status = new ContainerBuilder().addTextDisplayComponents(
    text("**Situação atual**"),
    text(
      [
        `**Painel automático:** ${yesNo(cfg.autoPanel)} · envia o painel no chat da call quando a primeira pessoa entra`,
        `**Apagar o painel ao esvaziar:** ${yesNo(cfg.autoPanelClean)} · apaga o painel enviado automaticamente quando ninguém mais está na call`,
        `**Restaurar a call ao esvaziar:** ${yesNo(cfg.resetOnEmpty)} · volta ao padrão sozinha (pública, sem limite, sem acessos) só as calls mexidas pelo painel`,
        `**Tempo vazia antes de apagar/restaurar:** ${secs(cfg.emptyDelay, "`na hora`")}`,
        `**Intervalo entre ações:** ${secs(cfg.cooldown, "`nenhum`")} (moderação não espera)`,
        `**Pessoas por seleção:** \`${cfg.pickerMax}\` · **Proteger administradores:** ${yesNo(cfg.protectAdmins)}`,
        `**Registro das ações:** ${logChannel} · é o mesmo canal de Logs e registros → Painel de calls`,
      ].join("\n")
    )
  );

  const logSelect = new ChannelSelectMenuBuilder()
    .setCustomId("chcfg_logchannel")
    .setPlaceholder("Canal onde as ações do painel são registradas (opcional)")
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(0)
    .setMaxValues(1);
  if (logId) logSelect.setDefaultChannels(logId);

  const controls = new ContainerBuilder()
    .addTextDisplayComponents(text("**Ajustes**"), text("-# Os botões ligam e desligam; \"Tempos e limites\" abre uma janela com os números."))
    .addActionRowComponents(
      row(
        btn("chcfg_flag:autoPanel", `Painel automático: ${yesNo(cfg.autoPanel)}`, cfg.autoPanel ? ButtonStyle.Success : ButtonStyle.Secondary),
        btn("chcfg_flag:clean", `Apagar painel ao esvaziar: ${yesNo(cfg.autoPanelClean)}`, cfg.autoPanelClean ? ButtonStyle.Success : ButtonStyle.Secondary)
      )
    )
    .addActionRowComponents(
      row(
        btn("chcfg_flag:resetEmpty", `Restaurar call ao esvaziar: ${yesNo(cfg.resetOnEmpty)}`, cfg.resetOnEmpty ? ButtonStyle.Success : ButtonStyle.Secondary),
        btn("chcfg_flag:protectAdmins", `Proteger administradores: ${yesNo(cfg.protectAdmins)}`, cfg.protectAdmins ? ButtonStyle.Success : ButtonStyle.Secondary)
      )
    )
    .addActionRowComponents(row(btn("chcfg_edit:limits", "Tempos e limites", ButtonStyle.Primary)))
    .addActionRowComponents(row(logSelect));
  controls.addSeparatorComponents(new SeparatorBuilder());
  controls.addActionRowComponents(
    row(btn("chcfg_home", "Voltar"), btn("chcfg_reset_behavior", "Restaurar comportamento", ButtonStyle.Danger))
  );

  return [header, status, controls];
}

// Janela com os números do comportamento: tempo vazia, intervalo entre ações e pessoas por seleção
function buildLimitsModal(cfg) {
  return modal(
    "chcfg_modal:limits",
    "Tempos e limites",
    textLabel({
      id: "delay",
      label: "Tempo vazia antes de apagar/restaurar",
      description: "Segundos de 0 a 3600. 0 = na hora. Vazio = 0.",
      max: 4,
      value: String(cfg.emptyDelay),
    }),
    textLabel({
      id: "cooldown",
      label: "Intervalo entre ações do painel",
      description: "Segundos de 0 a 300, por pessoa. 0 = sem intervalo. Vazio = 0.",
      max: 3,
      value: String(cfg.cooldown),
    }),
    textLabel({
      id: "picker",
      label: "Pessoas por seleção",
      description: "De 1 a 25 (adicionar, remover, desconectar, mover, blacklist). Vazio = 5.",
      max: 2,
      value: String(cfg.pickerMax),
    })
  );
}

// ---------- Botões ----------

const styleName = (cfg, key) => STYLE_LABELS[cfg.styles[key]] ?? "cinza";

function buildCallHubButtons(guild, cfg) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Botões do painel"),
    text("-# Escolha um botão na lista para editar nome, descrição, cor e se aparece. Aqui também dá para trocar os botões por select menu."),
    text(`-# Formato atual: **${cfg.mode === "select" ? "select menu" : "botões"}**`)
  );

  const lines = SECTIONS.map((section) => {
    const items = section.keys
      .map((key) => {
        const hidden = cfg.hidden.includes(key) || /^(-|nenhum)$/i.test(cfg.texts[`b_${key}`].trim());
        return `\`${clip(cfg.texts[`b_${key}`], 40)}\` ${hidden ? "escondido" : styleName(cfg, key)}`;
      })
      .join(" · ");
    const title = clip(cfg.texts[section.titleKey], 100).replace(/[*_`#>|~]|-#/g, "").trim() || section.id;
    return `**${title}**\n-# ${items}`;
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId("chcfg_btn")
    .setPlaceholder("Escolha um botão para editar")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      SECTIONS.flatMap((section) =>
        section.keys.map((key) => ({
          label: clip(cfg.texts[`b_${key}`], 100) || key,
          description: clip(`${clip(cfg.texts[section.titleKey], 100).replace(/[*_\`#>|~]|-#/g, "").trim()} · ${styleName(cfg, key)}`, 100),
          value: key,
        }))
      )
    );

  const body = new ContainerBuilder()
    .addTextDisplayComponents(text("**Situação atual**"), text(lines.join("\n")))
    .addActionRowComponents(row(menu))
    .addActionRowComponents(
      row(
        btn("chcfg_mode", `Formato: ${cfg.mode === "select" ? "select menu" : "botões"}`, ButtonStyle.Primary),
        btn("chcfg_buttons_reset", "Restaurar botões", ButtonStyle.Danger)
      )
    );
  body.addSeparatorComponents(new SeparatorBuilder());
  body.addActionRowComponents(row(btn("chcfg_page:look", "Voltar")));

  return [header, body];
}

// Janela de um botão: nome, descrição, cor e visibilidade
function buildButtonModal(key, cfg) {
  const colorOptions = Object.entries(STYLE_LABELS).map(([value, label]) => ({
    label: label[0].toUpperCase() + label.slice(1),
    value,
    default: value === cfg.styles[key],
  }));
  const hidden = cfg.hidden.includes(key);
  return modal(
    `chcfg_modal:btn_${key}`,
    "Editar botão",
    textLabel({
      id: "name",
      label: "Nome do botão",
      description: "Texto que aparece no botão. Vazio = padrão.",
      max: 80,
      required: false,
      value: cfg.texts[`b_${key}`],
    }),
    textLabel({
      id: "desc",
      label: "Descrição",
      description: "Aparece na legenda e dentro do select menu. Vazio = padrão.",
      max: 150,
      required: false,
      value: cfg.texts[`d_${key}`],
    }),
    selectLabel({ id: "style", label: "Cor do botão", options: colorOptions, required: true }),
    selectLabel({
      id: "visible",
      label: "Aparece no painel?",
      options: [
        { label: "Mostrar", value: "show", default: !hidden },
        { label: "Esconder", value: "hide", default: hidden },
      ],
      required: true,
    })
  );
}

// ---------- Mensagens e respostas ----------

const oneLine = (value) => String(value).replace(/\s+/g, " ").trim();

function buildCallHubMessages(guild, cfg) {
  const edited = (key) => cfg.msgs[key] !== DEFAULT_MESSAGES[key];
  const total = Object.keys(MESSAGES).length;
  const changed = Object.keys(MESSAGES).filter(edited).length;

  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Mensagens e respostas"),
    text("-# Escolha uma mensagem na lista do grupo para editar. Palavras entre chaves, como `{pessoas}`, são trocadas na hora de enviar. Texto vazio volta ao padrão."),
    text(`-# Editadas: **${changed}** de ${total}`)
  );

  const body = new ContainerBuilder();
  for (const group of GROUPS) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`chcfg_msg:${group.id}`)
      .setPlaceholder(clip(group.placeholder, 100))
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        group.items.map((item) => ({
          label: clip(`${edited(item.key) ? "* " : ""}${item.label}`, 100),
          description: clip(oneLine(cfg.msgs[item.key]), 100) || "-",
          value: item.key,
        }))
      );
    body.addTextDisplayComponents(text(`**${group.title}**`)).addActionRowComponents(row(menu));
  }
  body.addSeparatorComponents(new SeparatorBuilder());
  body.addActionRowComponents(
    row(btn("chcfg_page:look", "Voltar"), btn("chcfg_reset_msgs", "Restaurar mensagens", ButtonStyle.Danger))
  );
  return [header, body];
}

function buildMessageModal(key, cfg) {
  const item = MESSAGES[key];
  const vars = item.vars.length ? item.vars.map((v) => `{${v}}`).join(" ") : "nenhuma";
  const m = modal(
    `chcfg_modal:msg_${key}`,
    "Editar mensagem",
    textLabel({
      id: "text",
      label: clip(item.label, 45),
      description: "Vazio = volta ao padrão.",
      style: PARAGRAPH,
      max: 1000,
      required: false,
      value: cfg.msgs[key],
    })
  );
  // Texto de apoio dentro da janela: variáveis aceitas e texto padrão
  if (typeof m.addTextDisplayComponents === "function") {
    m.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(clip(`**Variáveis:** ${vars}\n**Padrão:** ${DEFAULT_MESSAGES[key]}`, 900))
    );
  }
  return m;
}

// ---------- Modais ----------

const SHORT = TextInputStyle.Short;
const PARAGRAPH = TextInputStyle.Paragraph;

function buildMainModal(cfg) {
  const colorNow = cfg.color === null ? undefined : `#${cfg.color.toString(16).padStart(6, "0")}`;
  const footerNow = cfg.texts.footer === DEFAULT_TEXTS.footer ? undefined : cfg.texts.footer;
  return modal(
    "chcfg_modal:main",
    "Título e aparência",
    textLabel({ id: "title", label: "Título", description: "Formatação livre. Ex.: # Título grande. Vazio = padrão.", max: 200, value: cfg.texts.title }),
    textLabel({
      id: "desc",
      label: "Descrição",
      description: "Formatação livre. Ex.: > citação ou -# pequeno. Vazio = padrão.",
      style: PARAGRAPH,
      max: 1500,
      value: cfg.texts.desc,
    }),
    textLabel({
      id: "footer",
      label: "Rodapé",
      description: "Vazio = padrão. Escreva \"nenhum\" para tirar o rodapé.",
      style: PARAGRAPH,
      max: 300,
      value: footerNow,
    }),
    textLabel({ id: "color", label: "Cor do painel", description: "Ex.: #5865F2. Vazio = sem cor.", max: 7, value: colorNow }),
    textLabel({
      id: "thumbnail",
      label: "Miniatura",
      description: "Vazio = ícone do servidor. Ou: nenhuma, ou um link de imagem.",
      max: 300,
      value: cfg.thumbnail && cfg.thumbnail !== "none" ? cfg.thumbnail : undefined,
    })
  );
}

// Cada seção: título e descrição (os botões são editados na aba "Botões")
function buildSectionModal(sectionId, cfg) {
  const section = SECTIONS.find((s) => s.id === sectionId);
  return modal(
    `chcfg_modal:${sectionId}`,
    "Editar seção do painel",
    textLabel({
      id: "title",
      label: "Título da seção",
      description: "Formatação livre. Ex.: ## Título ou **NEGRITO**. Vazio = padrão.",
      max: 200,
      value: cfg.texts[section.titleKey],
    }),
    textLabel({
      id: "desc",
      label: "Descrição da seção (opcional)",
      description: "Aparece abaixo do título. Aceita formatação. Vazio = sem descrição.",
      style: PARAGRAPH,
      max: 1000,
      value: cfg.texts[section.descKey],
    })
  );
}

module.exports = {
  buildCallHubHome,
  buildCallHubAccess,
  buildCallHubLook,
  buildCallHubBehavior,
  buildLimitsModal,
  buildMainModal,
  buildSectionModal,
  buildCallHubButtons,
  buildButtonModal,
  buildCallHubMessages,
  buildMessageModal,
};
