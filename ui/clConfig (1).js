const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  TextInputStyle,
} = require("discord.js");
const { addBackButton } = require("./backButton");
const { textLabel, modal } = require("./modalHelpers");

// Painéis do menu: Moderação → Comando cl

const text = (content) => new TextDisplayBuilder().setContent(String(content).slice(0, 3000));
const btn = (id, label, style = ButtonStyle.Secondary) =>
  new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
const yesNo = (value) => (value ? "Sim" : "Não");

const ACCESS_LABEL = {
  staff: "Equipe do servidor + cargos extras",
  roles: "Somente os cargos escolhidos",
  everyone: "Todos os membros",
};
const ACCESS_SHORT = { staff: "Equipe", roles: "Só cargos escolhidos", everyone: "Todos" };

const mentionRoles = (list) => (list.length ? list.map((id) => `<@&${id}>`).join(" ") : "`Nenhum`");
const mentionChannels = (list) => (list.length ? list.map((id) => `<#${id}>`).join(" ") : "`Nenhum`");

// ---------- Painel principal ----------

function buildClHome(guild, cfg) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Comando cl"),
    text("-# Quem digitar `cl` (sem prefixo) tem as próprias mensagens apagadas na hora."),
    text(`-# Comando: **${cfg.enabled ? "ativado" : "desativado"}**`)
  );

  const status = new ContainerBuilder().addTextDisplayComponents(
    text("**Situação atual**"),
    text(
      [
        `**Quem pode usar:** ${ACCESS_LABEL[cfg.access]}`,
        `**Cargos permitidos:** ${mentionRoles(cfg.roles.filter((id) => guild.roles.cache.has(id)))}`,
        `**Cargos bloqueados:** ${mentionRoles(cfg.blockedRoles.filter((id) => guild.roles.cache.has(id)))}`,
        `**Canais permitidos:** ${cfg.allowedChannels.length ? mentionChannels(cfg.allowedChannels) : "`Todos`"}`,
        `**Canais bloqueados:** ${mentionChannels(cfg.blockedChannels)}`,
        `**Alcance:** ${cfg.scope === "guild" ? "Todos os canais do servidor" : "Somente o canal em que foi usado"}`,
        `**Quantidade:** ${cfg.amount ? `até \`${cfg.amount}\` mensagens` : "`todas`"} · busca nas últimas \`${cfg.scanLimit}\` de cada canal`,
        `**Mensagens antigas (+14 dias):** ${yesNo(cfg.includeOld)} · **Manter fixadas:** ${yesNo(cfg.skipPinned)}`,
        `**Apagar o próprio "cl":** ${yesNo(cfg.deleteTrigger)} · **Espera entre usos:** ${cfg.cooldown ? `\`${cfg.cooldown}s\`` : "`nenhuma`"}`,
        `**Aviso no canal:** ${cfg.notice ? `Sim (some em \`${cfg.noticeSeconds}s\`)` : "Não"} · **Registrar no log de mensagens:** ${yesNo(cfg.sendLog)}`,
        "-# Administradores e o dono sempre podem usar (respeitando os canais).",
      ].join("\n")
    )
  );

  const controls = new ContainerBuilder()
    .addTextDisplayComponents(text("**Ajustes rápidos**"), text("-# Clique para alternar cada opção."))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        btn("clcfg_toggle", cfg.enabled ? "Desativar" : "Ativar", cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
        btn("clcfg_access", `Quem usa: ${ACCESS_SHORT[cfg.access]}`),
        btn("clcfg_scope", `Alcance: ${cfg.scope === "guild" ? "Servidor" : "Canal"}`)
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        btn("clcfg_old", `Antigas: ${yesNo(cfg.includeOld)}`),
        btn("clcfg_pinned", `Manter fixadas: ${yesNo(cfg.skipPinned)}`),
        btn("clcfg_trigger", `Apagar o cl: ${yesNo(cfg.deleteTrigger)}`),
        btn("clcfg_notice", `Aviso: ${yesNo(cfg.notice)}`),
        btn("clcfg_log", `Log: ${yesNo(cfg.sendLog)}`)
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        btn("clcfg_page:roles", "Cargos"),
        btn("clcfg_page:channels", "Canais"),
        btn("clcfg_edit", "Quantidade e tempos"),
        btn("clcfg_reset", "Restaurar padrão", ButtonStyle.Danger)
      )
    );
  addBackButton(controls, "back_moderacao");

  return [header, status, controls];
}

// ---------- Cargos ----------

function roleSelect(customId, placeholder, guild, selected) {
  const select = new RoleSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .setMinValues(0)
    .setMaxValues(25);
  const defaults = selected.filter((id) => guild.roles.cache.has(id)).slice(0, 25);
  if (defaults.length) select.setDefaultRoles(...defaults);
  return new ActionRowBuilder().addComponents(select);
}

function buildClRoles(guild, cfg) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Cargos do comando cl"),
    text(`-# Modo atual: **${ACCESS_LABEL[cfg.access]}**. Troque o modo na tela anterior (botão "Quem usa").`)
  );

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text("**Cargos que podem usar**"),
      text(
        cfg.access === "everyone"
          ? "-# O modo está em \"Todos\": esta lista não tem efeito agora."
          : cfg.access === "staff"
            ? "-# No modo Equipe, estes cargos usam o comando além da equipe do servidor."
            : "-# Só quem tem pelo menos um destes cargos usa o comando."
      )
    )
    .addActionRowComponents(roleSelect("clcfg_roles", "Selecione os cargos permitidos", guild, cfg.roles))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      text("**Cargos bloqueados**"),
      text("-# Quem tiver algum destes cargos não consegue usar (administradores ignoram o bloqueio).")
    )
    .addActionRowComponents(roleSelect("clcfg_blockedroles", "Selecione os cargos bloqueados", guild, cfg.blockedRoles));
  addBackButton(container, "clcfg_home");

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

function buildClChannels(guild, cfg) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Canais do comando cl"),
    text("-# Defina onde o comando funciona.")
  );

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text("**Canais permitidos**"),
      text("-# Se escolher algum, o comando só funciona neles. Vazio = funciona em todos.")
    )
    .addActionRowComponents(channelSelect("clcfg_allowedch", "Selecione os canais permitidos", guild, cfg.allowedChannels))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      text("**Canais bloqueados**"),
      text("-# O comando não funciona nestes canais e, no alcance \"Servidor\", nada é apagado neles.")
    )
    .addActionRowComponents(channelSelect("clcfg_blockedch", "Selecione os canais bloqueados", guild, cfg.blockedChannels));
  addBackButton(container, "clcfg_home");

  return [header, container];
}

// ---------- Modal: quantidade e tempos ----------

function buildValuesModal(cfg) {
  return modal(
    "clcfg_modal:values",
    "Quantidade e tempos",
    textLabel({
      id: "amount",
      label: "Quantidade de mensagens",
      description: "0 = todas as mensagens encontradas. Máximo: 5000.",
      max: 4,
      value: String(cfg.amount),
      placeholder: "0",
    }),
    textLabel({
      id: "scanLimit",
      label: "Mensagens examinadas por canal",
      description: "Quantas mensagens recentes ele olha para achar as suas (100 a 5000).",
      max: 4,
      value: String(cfg.scanLimit),
      placeholder: "1000",
    }),
    textLabel({
      id: "cooldown",
      label: "Espera entre usos (segundos)",
      description: "0 = sem espera. Máximo: 3600.",
      max: 4,
      value: String(cfg.cooldown),
      placeholder: "0",
    }),
    textLabel({
      id: "noticeSeconds",
      label: "Tempo do aviso no canal (segundos)",
      description: "Só vale se o aviso estiver ativado (1 a 60).",
      max: 2,
      value: String(cfg.noticeSeconds),
      placeholder: "5",
    })
  );
}

module.exports = { buildClHome, buildClRoles, buildClChannels, buildValuesModal };
