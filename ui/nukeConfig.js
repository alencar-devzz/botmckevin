const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  RoleSelectMenuBuilder,
  UserSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  TextInputStyle,
} = require("discord.js");
const { addBackButton } = require("./backButton");
const { textLabel, modal } = require("./modalHelpers");
const { MODE_LABEL, MODE_SHORT, VARIABLES, TOKENS, DEFAULTS } = require("../utils/nuke/defaults");
const { parseColor, isUrl } = require("../utils/nuke/render");

// Painéis do menu: Moderação → Comando nnuke

const text = (content) => new TextDisplayBuilder().setContent(String(content).slice(0, 3000));
const btn = (id, label, style = ButtonStyle.Secondary) =>
  new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
const yesNo = (value) => (value ? "Sim" : "Não");
const clip = (value, max) => {
  const s = String(value ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};
const code = (value) => `\`${String(value ?? "").replaceAll("`", "'")}\``;

const ACCESS_LABEL = {
  staff: "Equipe do servidor + cargos e pessoas extras",
  roles: "Somente os cargos e pessoas escolhidos",
  admin: "Somente administradores + pessoas escolhidas",
};
const ACCESS_SHORT = { staff: "Equipe", roles: "Só cargos escolhidos", admin: "Só administradores" };
const NEXT_ACCESS = { staff: "roles", roles: "admin", admin: "staff" };

const mentionRoles = (list) => (list.length ? list.map((id) => `<@&${id}>`).join(" ") : "`Nenhum`");
const mentionUsers = (list) => (list.length ? list.map((id) => `<@${id}>`).join(" ") : "`Ninguém`");
const mentionChannels = (list) => (list.length ? list.map((id) => `<#${id}>`).join(" ") : "`Nenhum`");

function thumbLabel(value) {
  if (value === "avatar") return "foto de quem usou";
  if (value === "server") return "ícone do servidor";
  if (isUrl(value)) return "link personalizado";
  return "nenhuma";
}

// ---------- Painel principal ----------

function buildNukeHome(guild, cfg) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Comando nnuke"),
    text("-# Recria o canal do zero (nome, permissões, categoria e posição), apaga o antigo e envia o aviso no novo."),
    text(`-# Comando: **${cfg.enabled ? "ativado" : "desativado"}**`)
  );

  const status = new ContainerBuilder().addTextDisplayComponents(
    text("**Situação atual**"),
    text(
      [
        `**Quem pode usar:** ${ACCESS_LABEL[cfg.access]}`,
        `**Cargos extras:** ${mentionRoles(cfg.roles.filter((id) => guild.roles.cache.has(id)))}`,
        `**Cargos bloqueados:** ${mentionRoles(cfg.blockedRoles.filter((id) => guild.roles.cache.has(id)))}`,
        `**Pessoas extras:** ${mentionUsers(cfg.users)}`,
        `**Canais permitidos:** ${cfg.allowedChannels.length ? mentionChannels(cfg.allowedChannels) : "`Todos`"}`,
        `**Canais protegidos:** ${mentionChannels(cfg.protectedChannels)}`,
        `**Espera entre usos:** ${cfg.cooldown ? `\`${cfg.cooldown}s\`` : "`nenhuma`"} · **Apagar o aviso depois de:** ${cfg.autoDeleteSeconds ? `\`${cfg.autoDeleteSeconds}s\`` : "`nunca`"}`,
        `**Mensagem:** ${MODE_SHORT[cfg.mode]} · cor ${cfg.color && parseColor(cfg.color) !== null ? code(cfg.color) : "`nenhuma`"} · miniatura: ${thumbLabel(cfg.thumbnail)}`,
        `**Registrar no log de canais:** ${yesNo(cfg.sendLog)} · **Atualizar o ID nas configurações do bot:** ${yesNo(cfg.migrate)}`,
        `**Fixar o aviso:** ${yesNo(cfg.pin)} · **Notificar quem usou:** ${yesNo(cfg.pingExecutor)}`,
        "-# Administradores e o dono sempre podem usar (respeitando os canais protegidos).",
      ].join("\n")
    )
  );

  const controls = new ContainerBuilder()
    .addTextDisplayComponents(text("**Ajustes rápidos**"), text("-# Clique para alternar cada opção."))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        btn("nukecfg_toggle", cfg.enabled ? "Desativar" : "Ativar", cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
        btn("nukecfg_access", `Quem usa: ${ACCESS_SHORT[cfg.access]}`),
        btn("nukecfg_page:msg", "Mensagem", ButtonStyle.Primary)
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        btn("nukecfg_log", `Log: ${yesNo(cfg.sendLog)}`),
        btn("nukecfg_migrate", `Atualizar IDs: ${yesNo(cfg.migrate)}`),
        btn("nukecfg_pin", `Fixar: ${yesNo(cfg.pin)}`),
        btn("nukecfg_ping", `Notificar: ${yesNo(cfg.pingExecutor)}`)
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        btn("nukecfg_page:roles", "Cargos e pessoas"),
        btn("nukecfg_page:channels", "Canais"),
        btn("nukecfg_edit", "Tempos"),
        btn("nukecfg_reset", "Restaurar padrão", ButtonStyle.Danger)
      )
    );
  addBackButton(controls, "back_moderacao");

  return [header, status, controls];
}

// ---------- Mensagem ----------

function buildNukeMessagePanel(guild, cfg) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Mensagem do nnuke"),
    text("-# Enviada no canal novo, logo depois de recriar. Use as variáveis e os marcadores abaixo.")
  );

  const lines = [`**Formato:** ${MODE_LABEL[cfg.mode]}`];
  if (cfg.mode === "container") {
    lines.push(`**Texto:** ${cfg.containerText.trim() ? code(clip(cfg.containerText, 140)) : "`(vazio: usa o padrão)`"}`);
  } else if (cfg.mode === "text") {
    lines.push(`**Texto:** ${cfg.text.trim() ? code(clip(cfg.text, 140)) : "`(vazio: usa o padrão)`"}`);
  } else {
    lines.push(
      `**Título:** ${cfg.embedTitle.trim() ? code(clip(cfg.embedTitle, 80)) : "`(vazio)`"}`,
      `**Descrição:** ${cfg.embedDescription.trim() ? code(clip(cfg.embedDescription, 120)) : "`(vazia)`"}`,
      `**Rodapé:** ${cfg.embedFooter.trim() ? code(clip(cfg.embedFooter, 80)) : "`(vazio)`"} · **Horário no rodapé:** ${yesNo(cfg.embedTimestamp)}`
    );
  }
  if (cfg.mode !== "text") {
    lines.push(
      `**Cor:** ${cfg.color && parseColor(cfg.color) !== null ? code(cfg.color) : cfg.mode === "embed" ? "`padrão (azul)`" : "`nenhuma`"}`,
      `**Miniatura:** ${thumbLabel(cfg.thumbnail)}${isUrl(cfg.thumbnail) ? ` ${code(clip(cfg.thumbnail, 60))}` : ""}`,
      `**Imagem grande:** ${isUrl(cfg.image) ? code(clip(cfg.image, 60)) : "`nenhuma`"}`
    );
  }

  const status = new ContainerBuilder().addTextDisplayComponents(text("**Situação atual**"), text(lines.join("\n")));

  const row1 = [
    btn("nukecfg_mode", `Formato: ${MODE_SHORT[cfg.mode]}`),
    btn("nukecfg_text", "Editar texto", ButtonStyle.Primary),
  ];
  if (cfg.mode !== "text") {
    row1.push(btn("nukecfg_color", "Cor"), btn("nukecfg_media", "Miniatura e imagem"));
  }

  const row2 = [btn("nukecfg_preview", "Pré-visualizar", ButtonStyle.Success), btn("nukecfg_vars", "Variáveis e marcadores")];
  if (cfg.mode === "embed") row2.push(btn("nukecfg_stamp", `Horário: ${yesNo(cfg.embedTimestamp)}`));
  row2.push(btn("nukecfg_resetmsg", "Restaurar mensagem", ButtonStyle.Danger));

  const controls = new ContainerBuilder()
    .addTextDisplayComponents(text("**Personalizar**"), text("-# O formato Container usa Components V2, com cor lateral, miniatura e separadores."))
    .addActionRowComponents(new ActionRowBuilder().addComponents(...row1))
    .addActionRowComponents(new ActionRowBuilder().addComponents(...row2));
  addBackButton(controls, "nukecfg_home");

  return [header, status, controls];
}

// ---------- Variáveis e marcadores (resposta só para quem pediu) ----------

function buildNukeVariables() {
  return [
    new ContainerBuilder().addTextDisplayComponents(
      text("### Variáveis e marcadores do nnuke"),
      text(`**Variáveis**\n${VARIABLES.map(([name, desc]) => `${code(name)} — ${desc}`).join("\n")}`),
      text(`**Marcadores (formato Container)**\n${TOKENS.map(([name, desc]) => `${code(name)} — ${desc}`).join("\n")}`),
      text("-# Escreva o marcador sozinho numa linha. Nos formatos Texto e Embed, os separadores viram uma linha desenhada.")
    ),
  ];
}

// ---------- Cargos e pessoas ----------

function roleSelect(customId, placeholder, guild, selected) {
  const select = new RoleSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).setMinValues(0).setMaxValues(25);
  const defaults = selected.filter((id) => guild.roles.cache.has(id)).slice(0, 25);
  if (defaults.length) select.setDefaultRoles(...defaults);
  return new ActionRowBuilder().addComponents(select);
}

function userSelect(customId, placeholder, selected) {
  const select = new UserSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).setMinValues(0).setMaxValues(25);
  const defaults = selected.slice(0, 25);
  if (defaults.length) select.setDefaultUsers(...defaults);
  return new ActionRowBuilder().addComponents(select);
}

function buildNukeRoles(guild, cfg) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Quem pode usar o nnuke"),
    text(`-# Modo atual: **${ACCESS_LABEL[cfg.access]}**. Troque o modo na tela anterior (botão "Quem usa").`)
  );

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text("**Cargos que podem usar**"),
      text(
        cfg.access === "admin"
          ? '-# O modo está em "Só administradores": esta lista não tem efeito agora.'
          : cfg.access === "staff"
            ? "-# No modo Equipe, estes cargos usam o comando além da equipe do servidor."
            : "-# Só quem tem pelo menos um destes cargos usa o comando."
      )
    )
    .addActionRowComponents(roleSelect("nukecfg_roles", "Selecione os cargos permitidos", guild, cfg.roles))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      text("**Cargos bloqueados**"),
      text("-# Quem tiver algum destes cargos não consegue usar (administradores ignoram o bloqueio).")
    )
    .addActionRowComponents(roleSelect("nukecfg_blockedroles", "Selecione os cargos bloqueados", guild, cfg.blockedRoles))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      text("**Pessoas que podem usar**"),
      text("-# Estas pessoas usam o comando em qualquer modo (a não ser que tenham um cargo bloqueado).")
    )
    .addActionRowComponents(userSelect("nukecfg_users", "Selecione as pessoas permitidas", cfg.users));
  addBackButton(container, "nukecfg_home");

  return [header, container];
}

// ---------- Canais ----------

function channelSelect(customId, placeholder, guild, selected) {
  const select = new ChannelSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(0)
    .setMaxValues(25);
  const defaults = selected.filter((id) => guild.channels.cache.has(id)).slice(0, 25);
  if (defaults.length) select.setDefaultChannels(...defaults);
  return new ActionRowBuilder().addComponents(select);
}

function buildNukeChannels(guild, cfg) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Canais do comando nnuke"),
    text("-# Defina onde o comando pode (ou não) recriar canais.")
  );

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text("**Canais permitidos**"),
      text("-# Se escolher algum, o comando só funciona neles. Vazio = funciona em qualquer canal de texto.")
    )
    .addActionRowComponents(channelSelect("nukecfg_allowedch", "Selecione os canais permitidos", guild, cfg.allowedChannels))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      text("**Canais protegidos**"),
      text("-# Estes canais nunca podem ser recriados, nem por administradores (ex.: regras, logs, anúncios).")
    )
    .addActionRowComponents(channelSelect("nukecfg_protectedch", "Selecione os canais protegidos", guild, cfg.protectedChannels));
  addBackButton(container, "nukecfg_home");

  return [header, container];
}

// ---------- Modais ----------

function buildValuesModal(cfg) {
  return modal(
    "nukecfg_modal:values",
    "Tempos do nnuke",
    textLabel({
      id: "cooldown",
      label: "Espera entre usos (segundos)",
      description: "0 = sem espera. Máximo: 3600. Administradores não esperam.",
      max: 4,
      value: String(cfg.cooldown),
      placeholder: "10",
    }),
    textLabel({
      id: "autoDelete",
      label: "Apagar o aviso depois de (segundos)",
      description: "0 = o aviso fica para sempre. Máximo: 3600.",
      max: 4,
      value: String(cfg.autoDeleteSeconds),
      placeholder: "0",
    })
  );
}

function buildTextModal(cfg) {
  if (cfg.mode === "embed") {
    return modal(
      "nukecfg_modal:text",
      "Texto do embed",
      textLabel({
        id: "embedTitle",
        label: "Título",
        description: "Aceita as variáveis. Vazio = sem título.",
        max: 256,
        value: cfg.embedTitle,
        placeholder: DEFAULTS.embedTitle,
      }),
      textLabel({
        id: "embedDescription",
        label: "Descrição",
        description: "Aceita variáveis e [separador]. Vazio = sem descrição.",
        style: TextInputStyle.Paragraph,
        max: 3500,
        value: cfg.embedDescription,
        placeholder: DEFAULTS.embedDescription,
      }),
      textLabel({
        id: "embedFooter",
        label: "Rodapé",
        description: "Aceita as variáveis. Vazio = sem rodapé.",
        max: 200,
        value: cfg.embedFooter,
      })
    );
  }

  const isText = cfg.mode === "text";
  return modal(
    "nukecfg_modal:text",
    isText ? "Texto da mensagem" : "Texto do container",
    textLabel({
      id: isText ? "text" : "containerText",
      label: "Mensagem",
      description: isText
        ? "Aceita as variáveis. Máximo: 2000 caracteres."
        : "Variáveis + [separador], [separador_largo] e [espaco] sozinhos numa linha.",
      style: TextInputStyle.Paragraph,
      max: isText ? 2000 : 3500,
      value: isText ? cfg.text : cfg.containerText,
      placeholder: DEFAULTS.containerText,
    })
  );
}

function buildColorModal(cfg) {
  return modal(
    "nukecfg_modal:color",
    "Cor da mensagem",
    textLabel({
      id: "color",
      label: "Cor em hexadecimal",
      description: "Ex.: #5865F2. Vazio = sem cor (no embed, usa o azul padrão).",
      max: 7,
      value: cfg.color,
      placeholder: "#5865F2",
    })
  );
}

function buildMediaModal(cfg) {
  return modal(
    "nukecfg_modal:media",
    "Miniatura e imagem",
    textLabel({
      id: "thumbnail",
      label: "Miniatura (canto da mensagem)",
      description: "Escreva avatar (foto de quem usou), servidor (ícone), nenhuma ou um link https://.",
      max: 300,
      value: cfg.thumbnail === "none" ? "" : cfg.thumbnail,
      placeholder: "avatar",
    }),
    textLabel({
      id: "image",
      label: "Imagem grande (link)",
      description: "Link https:// de uma imagem. Vazio = sem imagem.",
      max: 300,
      value: cfg.image,
      placeholder: "https://...",
    })
  );
}

module.exports = {
  NEXT_ACCESS,
  buildNukeHome,
  buildNukeMessagePanel,
  buildNukeVariables,
  buildNukeRoles,
  buildNukeChannels,
  buildValuesModal,
  buildTextModal,
  buildColorModal,
  buildMediaModal,
};
