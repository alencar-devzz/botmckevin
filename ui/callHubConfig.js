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

// Painéis do menu: Comunidade e interação → Calls temporárias

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
  const trigger = cfg.triggerChannelId && guild.channels.cache.has(cfg.triggerChannelId) ? cfg.triggerChannelId : null;
  const category = cfg.categoryId && guild.channels.cache.has(cfg.categoryId) ? cfg.categoryId : null;
  const missing = missingPerms(guild);

  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Calls temporárias"),
    text("-# Quem entra no canal gatilho ganha uma call só dele, com o nome dele. Quando todo mundo sai, a call é apagada."),
    text(`-# Sistema: **${cfg.enabled ? "ativado" : "desativado"}**${trigger ? "" : " · escolha o canal gatilho abaixo para funcionar"}`)
  );

  const example = cfg.nameTemplate.replace(/\{(nametag|username|globalname)\}/gi, "Fulano");
  const status = new ContainerBuilder().addTextDisplayComponents(
    text("**Situação atual**"),
    text(
      [
        `**Canal gatilho:** ${trigger ? `<#${trigger}>` : "`Nenhum`"}`,
        `**Categoria das calls:** ${category ? `<#${category}>` : "mesma categoria do gatilho"}`,
        `**Nome da call:** \`${cfg.nameTemplate}\` (ex.: \`${example}\`)`,
        `**Limite padrão:** ${cfg.defaultLimit ? `\`${cfg.defaultLimit}\` pessoas` : "`sem limite`"} · **Nasce privada:** ${yesNo(cfg.defaultPrivate)}`,
        `**Apagar quando vazia:** ${cfg.deleteDelay ? `após \`${cfg.deleteDelay}s\`` : "na hora"} · **Espera entre criações:** ${cfg.cooldown ? `\`${cfg.cooldown}s\`` : "`nenhuma`"}`,
        `**Dono saiu:** ${cfg.autoTransfer ? "passa o controle para quem ficou" : "a call continua com o mesmo dono"}`,
        `**Painel no chat da call:** ${yesNo(cfg.sendPanel)} · **Comando do painel:** \`${prefix}painel\``,
        `**Quem pode criar:** ${cfg.allowedRoles.length ? mentionRoles(guild, cfg.allowedRoles) : "todos"} · **Bloqueados:** ${mentionRoles(guild, cfg.blockedRoles)}`,
        `**Moderação (envia o painel fixo):** ${mentionRoles(guild, cfg.staffRoles)}`,
        missing.length ? `**Permissões que faltam ao bot:** ${missing.join(", ")}` : "**Permissões do bot:** tudo certo",
      ].join("\n")
    )
  );

  const triggerSelect = new ChannelSelectMenuBuilder()
    .setCustomId("chcfg_trigger")
    .setPlaceholder("Canal de voz gatilho (quem entra cria a call)")
    .setChannelTypes(ChannelType.GuildVoice)
    .setMinValues(0)
    .setMaxValues(1);
  if (trigger) triggerSelect.setDefaultChannels(trigger);

  const categorySelect = new ChannelSelectMenuBuilder()
    .setCustomId("chcfg_category")
    .setPlaceholder("Categoria onde as calls são criadas (opcional)")
    .setChannelTypes(ChannelType.GuildCategory)
    .setMinValues(0)
    .setMaxValues(1);
  if (category) categorySelect.setDefaultChannels(category);

  const controls = new ContainerBuilder()
    .addTextDisplayComponents(text("**Ajustes rápidos**"))
    .addActionRowComponents(row(triggerSelect))
    .addActionRowComponents(row(categorySelect))
    .addActionRowComponents(
      row(
        btn("chcfg_toggle", cfg.enabled ? "Desativar" : "Ativar", cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
        btn("chcfg_sendpanel", `Painel no chat: ${yesNo(cfg.sendPanel)}`),
        btn("chcfg_private", `Nasce privada: ${yesNo(cfg.defaultPrivate)}`),
        btn("chcfg_transfer", `Passar controle: ${yesNo(cfg.autoTransfer)}`)
      )
    )
    .addActionRowComponents(
      row(
        btn("chcfg_edit:values", "Nome e limites"),
        btn("chcfg_page:access", "Cargos e acesso"),
        btn("chcfg_page:look", "Painel da call"),
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
    text("### Cargos e acesso"),
    text("-# Quem pode criar call e quem faz parte da moderação das calls.")
  );

  const body = new ContainerBuilder()
    .addTextDisplayComponents(
      text("**Quem pode criar call**"),
      text("-# Vazio = todos podem. Se escolher cargos, só eles criam. Os bloqueados nunca criam.")
    )
    .addActionRowComponents(roleSelect("chcfg_allowed", "Cargos que podem criar call", cfg.allowedRoles, guild))
    .addActionRowComponents(roleSelect("chcfg_blocked", "Cargos que NÃO podem criar call", cfg.blockedRoles, guild))
    .addTextDisplayComponents(
      text("**Moderação**"),
      text("-# Esses cargos (e quem tem Administrador) podem enviar o painel fixo com o comando do painel. Os botões do painel são só do dono da call.")
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
      `-# Cor lateral: ${cfg.color === null ? "sem cor" : `\`#${cfg.color.toString(16).padStart(6, "0")}\``} · Miniatura: ${thumbLabel(cfg.thumbnail)} · Enviado no chat da call: ${yesNo(cfg.sendPanel)}`
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

function buildValuesModal(cfg) {
  return modal(
    "chcfg_modal:values",
    "Nome e limites",
    textLabel({
      id: "nameTemplate",
      label: "Nome da call",
      description: "Variáveis: {nametag} (apelido ou nome), {username}, {globalname}",
      max: 100,
      required: false,
      value: cfg.nameTemplate,
    }),
    textLabel({
      id: "defaultLimit",
      label: "Limite de pessoas ao criar",
      description: "0 = sem limite. Máximo 99.",
      max: 2,
      required: false,
      value: String(cfg.defaultLimit),
    }),
    textLabel({
      id: "deleteDelay",
      label: "Segundos até apagar a call vazia",
      description: "0 = apaga na hora. Máximo 300.",
      max: 3,
      required: false,
      value: String(cfg.deleteDelay),
    }),
    textLabel({
      id: "cooldown",
      label: "Espera entre criações (segundos)",
      description: "Evita spam de entrar e sair. 0 = sem espera. Máximo 3600.",
      max: 4,
      required: false,
      value: String(cfg.cooldown),
    })
  );
}

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
  buildValuesModal,
  buildMainModal,
  buildSectionModal,
  buildCallHubButtons,
  buildButtonModal,
  buildCallHubMessages,
  buildMessageModal,
};
