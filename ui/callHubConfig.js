const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelType,
  TextInputStyle,
  PermissionFlagsBits,
} = require("discord.js");
const { addBackButton } = require("./backButton");
const { textLabel, modal } = require("./modalHelpers");
const { SECTIONS, DEFAULT_TEXTS } = require("../utils/callHubDefaults");

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
        `**Equipe (painel em qualquer call):** ${mentionRoles(guild, cfg.staffRoles)}`,
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
    text("-# Quem pode criar call e quem pode usar o painel em calls de outras pessoas.")
  );

  const body = new ContainerBuilder()
    .addTextDisplayComponents(
      text("**Quem pode criar call**"),
      text("-# Vazio = todos podem. Se escolher cargos, só eles criam. Os bloqueados nunca criam.")
    )
    .addActionRowComponents(roleSelect("chcfg_allowed", "Cargos que podem criar call", cfg.allowedRoles, guild))
    .addActionRowComponents(roleSelect("chcfg_blocked", "Cargos que NÃO podem criar call", cfg.blockedRoles, guild))
    .addTextDisplayComponents(
      text("**Equipe**"),
      text("-# Esses cargos (e quem tem Administrador) usam o painel dentro de qualquer call, não só na própria.")
    )
    .addActionRowComponents(roleSelect("chcfg_staff", "Cargos da equipe", cfg.staffRoles, guild));
  body.addSeparatorComponents(new SeparatorBuilder());
  body.addActionRowComponents(row(btn("chcfg_home", "Voltar")));

  return [header, body];
}

// ---------- Aparência do painel ----------

function buildCallHubLook(guild, cfg, prefix) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Painel da call"),
    text(`-# Aparência do painel de gerenciamento. Para enviar em qualquer canal use \`${prefix}painel\`.`),
    text(
      `-# Cor: ${cfg.color === null ? "sem cor" : `\`#${cfg.color.toString(16).padStart(6, "0")}\``} · Miniatura: ${thumbLabel(cfg.thumbnail)} · Enviado no chat da call: ${yesNo(cfg.sendPanel)}`
    )
  );

  const body = new ContainerBuilder()
    .addTextDisplayComponents(
      text("**Editar textos**"),
      text("-# Título, descrição, rodapé, nome e descrição de cada botão, títulos das seções, cor e miniatura.")
    )
    .addActionRowComponents(
      row(
        btn("chcfg_edit:main", "Título e aparência"),
        btn("chcfg_edit:access", "Acesso e Privacidade"),
        btn("chcfg_edit:members", "Gerenciar Membros"),
        btn("chcfg_edit:tools", "Ferramentas")
      )
    )
    .addActionRowComponents(
      row(btn("chcfg_preview", "Pré-visualizar"), btn("chcfg_reset_ui", "Restaurar aparência", ButtonStyle.Danger))
    );
  body.addSeparatorComponents(new SeparatorBuilder());
  body.addActionRowComponents(row(btn("chcfg_home", "Voltar")));

  return [header, body];
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
    textLabel({ id: "title", label: "Título", description: "Deixe vazio para voltar ao padrão.", max: 100, value: cfg.texts.title }),
    textLabel({
      id: "desc",
      label: "Descrição",
      description: "Deixe vazio para voltar ao padrão.",
      style: PARAGRAPH,
      max: 300,
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

// Cada seção: título + uma linha por botão no formato "Nome | descrição"
function buildSectionModal(sectionId, cfg) {
  const section = SECTIONS.find((s) => s.id === sectionId);
  const lines = section.keys.map((key) => `${cfg.texts[`b_${key}`]} | ${cfg.texts[`d_${key}`]}`).join("\n");
  return modal(
    `chcfg_modal:${sectionId}`,
    "Editar seção do painel",
    textLabel({
      id: "title",
      label: "Título da seção",
      description: "Deixe vazio para voltar ao padrão.",
      max: 100,
      value: cfg.texts[section.titleKey],
    }),
    textLabel({
      id: "lines",
      label: "Botões (uma linha por botão, na ordem)",
      description: `Formato: Nome | descrição. São ${section.keys.length} linhas.`,
      style: PARAGRAPH,
      max: 1500,
      required: true,
      value: lines,
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
};
