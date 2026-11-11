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
const { formatInterval } = require("../utils/bump/render");
const { DISBOARD_ID, KIND_LABEL, VARIABLES, DEFAULT_SUCCESS_KEYWORDS } = require("../utils/bump/defaults");

// Painéis do menu: Moderação → Bump reminder

const text = (content) => new TextDisplayBuilder().setContent(String(content).slice(0, 3000));
const btn = (id, label, style = ButtonStyle.Secondary, disabled = false) =>
  new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
const MODE_LABEL = { text: "Texto", embed: "Embed", container: "Container (V2)" };
const yesNo = (value) => (value ? "Sim" : "Não");
const onOff = (value) => (value ? "ativado" : "desativado");

const mentionRoles = (list) => (list.length ? list.map((id) => `<@&${id}>`).join(" ") : "`Nenhum`");
const unix = (date) => Math.floor(new Date(date).getTime() / 1000);

// Coloca o texto dentro de um bloco de código sem deixar ``` quebrar o bloco
const codeBlock = (value, max = 600) => {
  const clean = String(value || "").replace(/```/g, "'''");
  const cut = clean.length > max ? `${clean.slice(0, max)}…` : clean;
  return "```\n" + (cut || " ") + "\n```";
};
const inline = (value, max = 80) => {
  const clean = String(value || "").replace(/`/g, "'").replace(/\s+/g, " ");
  return clean ? `\`${clean.length > max ? `${clean.slice(0, max)}…` : clean}\`` : "`vazio`";
};

// ---------- Painel principal ----------

function buildBumpHome(guild, cfg, state) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Bump reminder"),
    text("-# Avisa a hora de dar bump, agradece quem deu e marca essa pessoa no próximo aviso."),
    text(`-# Sistema: **${cfg.enabled ? "ativado" : "desativado"}**`)
  );

  const botLabel = cfg.bumpBotId === DISBOARD_ID ? "DISBOARD" : `ID ${cfg.bumpBotId}`;
  const channel = cfg.channelId && guild.channels.cache.has(cfg.channelId)
    ? `<#${cfg.channelId}>`
    : "`Último canal em que deram bump`";
  const lastLine = state?.lastBumperId
    ? `<@${state.lastBumperId}> · <t:${unix(state.lastBumpAt)}:R>`
    : "`Ninguém ainda`";
  const nextLine =
    state?.nextBumpAt && !state.reminderSent
      ? `<t:${unix(state.nextBumpAt)}:R>`
      : "`Nada agendado (aguardando um bump)`";

  const status = new ContainerBuilder().addTextDisplayComponents(
    text("**Situação atual**"),
    text(
      [
        `**Canal do lembrete:** ${channel}`,
        `**Bot de bump:** \`${botLabel}\` · comando \`/${cfg.commandName}\``,
        `**Tempo entre bumps:** \`${formatInterval(cfg.intervalMinutes)}\` · **Repetir lembrete:** ${cfg.repeatMinutes ? `a cada \`${formatInterval(cfg.repeatMinutes)}\`` : "`não`"}`,
        `**Cargos marcados no lembrete:** ${mentionRoles(cfg.mentionRoles.filter((id) => guild.roles.cache.has(id)))}`,
        `**Lembrete:** ${onOff(cfg.remind)} · formato \`${MODE_LABEL[cfg.reminder.mode]}\` · marca quem bumpou por último: ${yesNo(cfg.mentionLastBumper)}`,
        `**Agradecimento:** ${onOff(cfg.thank)} · formato \`${MODE_LABEL[cfg.thanks.mode]}\` · marca quem bumpou: ${yesNo(cfg.thanksMention)}`,
        `**Apagar lembrete antigo ao bumpar:** ${yesNo(cfg.deleteOldReminder)}`,
        "",
        `**Último bump:** ${lastLine}`,
        `**Próximo lembrete:** ${nextLine} · **Total de bumps:** \`${state?.totalBumps ?? 0}\``,
        cfg.enabled ? "" : "-# O sistema está desativado: nada será detectado até você ativar.",
      ]
        .filter((line, i, arr) => line !== "" || (arr[i - 1] !== "" && i !== arr.length - 1))
        .join("\n")
    )
  );

  const controls = new ContainerBuilder()
    .addTextDisplayComponents(text("**Ajustes rápidos**"), text("-# Clique para alternar cada opção."))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        btn("bumpcfg_toggle:enabled", cfg.enabled ? "Desativar" : "Ativar", cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
        btn("bumpcfg_toggle:remind", `Lembrete: ${yesNo(cfg.remind)}`),
        btn("bumpcfg_toggle:thank", `Agradecer: ${yesNo(cfg.thank)}`),
        btn("bumpcfg_toggle:mentionLastBumper", `Marcar último: ${yesNo(cfg.mentionLastBumper)}`),
        btn("bumpcfg_toggle:thanksMention", `Marcar no agradecimento: ${yesNo(cfg.thanksMention)}`)
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        btn("bumpcfg_page:channels", "Canal e cargos"),
        btn("bumpcfg_page:reminder", "Mensagem do lembrete"),
        btn("bumpcfg_page:thanks", "Mensagem do agradecimento"),
        btn("bumpcfg_timing", "Tempos e detecção")
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        btn("bumpcfg_toggle:deleteOldReminder", `Apagar lembrete antigo: ${yesNo(cfg.deleteOldReminder)}`),
        btn("bumpcfg_preview", "Pré-visualizar"),
        btn("bumpcfg_send", "Enviar lembrete agora", ButtonStyle.Primary),
        btn("bumpcfg_reset", "Restaurar padrão", ButtonStyle.Danger)
      )
    );
  addBackButton(controls, "back_moderacao");

  return [header, status, controls];
}

// ---------- Confirmação de restaurar ----------

function buildBumpResetConfirm() {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text("### Restaurar padrão?"),
      text("-# Isso apaga TODA a configuração do Bump reminder (canal, cargos, tempos e as duas mensagens). Quem deu o último bump e o horário do próximo lembrete são mantidos.")
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        btn("bumpcfg_reset_yes", "Sim, restaurar", ButtonStyle.Danger),
        btn("bumpcfg_home", "Cancelar")
      )
    );
  return [container];
}

// ---------- Canal e cargos ----------

function buildBumpChannels(guild, cfg) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Canal e cargos do lembrete"),
    text("-# Onde o lembrete é enviado e quem é marcado nele.")
  );

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId("bumpcfg_channel")
    .setPlaceholder("Selecione o canal do lembrete")
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(0)
    .setMaxValues(1);
  if (cfg.channelId && guild.channels.cache.has(cfg.channelId)) channelSelect.setDefaultChannels(cfg.channelId);

  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId("bumpcfg_roles")
    .setPlaceholder("Selecione os cargos a marcar (opcional)")
    .setMinValues(0)
    .setMaxValues(25);
  const defaults = cfg.mentionRoles.filter((id) => guild.roles.cache.has(id)).slice(0, 25);
  if (defaults.length) roleSelect.setDefaultRoles(...defaults);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text("**Canal do lembrete**"),
      text("-# Deixe vazio para usar o último canal em que alguém deu bump. O agradecimento sempre sai no canal onde o bump foi dado.")
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(channelSelect))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      text("**Cargos marcados no lembrete**"),
      text("-# Estes cargos são marcados toda vez que o lembrete sair (além de quem deu o último bump, se a opção estiver ligada). Vazio = nenhum cargo.")
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(roleSelect));
  addBackButton(container, "bumpcfg_home");

  return [header, container];
}

// ---------- Editor de mensagem (lembrete / agradecimento) ----------

function buildBumpMessagePage(cfg, kind) {
  const msg = cfg[kind];
  const isEmbed = msg.mode === "embed";
  const isContainer = msg.mode === "container";

  const header = new ContainerBuilder().addTextDisplayComponents(
    text(`### ${KIND_LABEL[kind]}`),
    text(
      `-# Formato atual: **${MODE_LABEL[msg.mode]}**. ` +
        (kind === "reminder"
          ? "Quem bumpou por último e os cargos escolhidos são marcados numa linha acima da mensagem."
          : "Se \"Marcar no agradecimento\" estiver ligado, quem bumpou é marcado numa linha acima da mensagem.")
    )
  );

  const current = isContainer
    ? [
        "**Container (Components V2)**",
        codeBlock(msg.containerText, 700),
        `**Cor lateral:** ${msg.containerColor ? `\`${msg.containerColor}\`` : "`nenhuma`"} · **Miniatura:** ${msg.containerThumbnail ? "definida" : "nenhuma"} · **Imagem:** ${msg.containerImage ? "definida" : "nenhuma"}`,
        "-# Uma linha só com `---` vira um separador dentro do container.",
      ]
    : isEmbed
    ? [
        "**Embed**",
        `**Título:** ${inline(msg.embedTitle)}${msg.embedUrl ? " (com link)" : ""}`,
        `**Descrição:** ${codeBlock(msg.embedDescription, 500)}`,
        `**Cor:** \`${msg.embedColor}\` · **Autor:** ${inline(msg.embedAuthor, 40)} · **Rodapé:** ${inline(msg.embedFooter, 40)}`,
        `**Imagem:** ${msg.embedImage ? "definida" : "nenhuma"} · **Miniatura:** ${msg.embedThumbnail ? "definida" : "nenhuma"} · **Horário:** ${yesNo(msg.embedTimestamp)}`,
      ]
    : ["**Texto da mensagem**", codeBlock(msg.text, 700)];

  const vars = VARIABLES.map(([name, desc]) => `\`${name}\` ${desc}`).join("\n");

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text(current.join("\n")),
      text(`**Variáveis disponíveis**\n-# ${vars.replace(/\n/g, "\n-# ")}`)
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        btn(`bumpcfg_mode:${kind}`, `Formato: ${MODE_LABEL[msg.mode]}`, ButtonStyle.Primary),
        btn(`bumpcfg_text:${kind}`, "Editar texto", ButtonStyle.Secondary, isEmbed),
        btn(`bumpcfg_embed:${kind}`, isContainer ? "Cor e imagens" : "Editar embed", ButtonStyle.Secondary, !isEmbed && !isContainer),
        btn(`bumpcfg_media:${kind}`, "Imagens e links", ButtonStyle.Secondary, !isEmbed),
        btn(`bumpcfg_ts:${kind}`, `Horário na embed: ${yesNo(msg.embedTimestamp)}`, ButtonStyle.Secondary, !isEmbed)
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        btn(`bumpcfg_preview:${kind}`, "Pré-visualizar"),
        btn(`bumpcfg_resetmsg:${kind}`, "Restaurar esta mensagem", ButtonStyle.Danger)
      )
    );
  addBackButton(container, "bumpcfg_home");

  return [header, container];
}

// ---------- Modais ----------

function buildTimingModal(cfg) {
  return modal(
    "bumpcfg_modal:timing",
    "Tempos e detecção",
    textLabel({
      id: "interval",
      label: "Tempo entre bumps (minutos)",
      description: "120 = 2 hrs (o DISBOARD libera de 2 em 2 horas). De 1 a 10080.",
      max: 5,
      value: String(cfg.intervalMinutes),
      placeholder: "120",
    }),
    textLabel({
      id: "repeat",
      label: "Repetir o lembrete se ninguém bumpar (min)",
      description: "0 = não repete. Máximo: 1440.",
      max: 4,
      value: String(cfg.repeatMinutes),
      placeholder: "0",
    }),
    textLabel({
      id: "botId",
      label: "ID do bot de bump",
      description: `Padrão: ${DISBOARD_ID} (DISBOARD).`,
      max: 25,
      value: cfg.bumpBotId,
      placeholder: DISBOARD_ID,
    }),
    textLabel({
      id: "command",
      label: "Nome do comando de bump",
      description: "Sem a barra. Padrão: bump.",
      max: 32,
      value: cfg.commandName,
      placeholder: "bump",
    }),
    textLabel({
      id: "keywords",
      label: "Textos que confirmam o bump",
      description: "Separados por vírgula. Vazio = padrão (vários idiomas do DISBOARD).",
      style: TextInputStyle.Paragraph,
      max: 400,
      value: cfg.customKeywords ? cfg.successKeywords.join(", ") : "",
      placeholder: DEFAULT_SUCCESS_KEYWORDS.slice(0, 3).join(", "),
    })
  );
}

function buildTextModal(cfg, kind) {
  if (cfg[kind].mode === "container") {
    return modal(
      `bumpcfg_modal:ctext:${kind}`,
      `Texto: ${KIND_LABEL[kind]}`,
      textLabel({
        id: "text",
        label: "Texto do container",
        description: "Markdown (## títulos, -# pequeno) e variáveis. Uma linha só com --- vira separador.",
        style: TextInputStyle.Paragraph,
        max: 3500,
        value: cfg[kind].containerText,
      })
    );
  }
  return modal(
    `bumpcfg_modal:text:${kind}`,
    `Texto: ${KIND_LABEL[kind]}`,
    textLabel({
      id: "text",
      label: "Texto da mensagem",
      description: "Aceita markdown (## títulos, -# texto pequeno) e as variáveis {user}, {interval}, {next}…",
      style: TextInputStyle.Paragraph,
      max: 2000,
      value: cfg[kind].text,
    })
  );
}

function buildContainerStyleModal(cfg, kind) {
  const m = cfg[kind];
  const url = "Link direto começando com https://. Vazio = nenhum.";
  return modal(
    `bumpcfg_modal:cstyle:${kind}`,
    `Cor e imagens: ${KIND_LABEL[kind]}`,
    textLabel({
      id: "color",
      label: "Cor lateral do container (hex)",
      description: "Ex.: #5865F2. Vazio = sem cor.",
      max: 7,
      value: m.containerColor,
      placeholder: "#5865F2",
    }),
    textLabel({ id: "thumbnail", label: "Miniatura (ao lado do texto)", description: url, max: 500, value: m.containerThumbnail }),
    textLabel({ id: "image", label: "Imagem grande (embaixo)", description: url, max: 500, value: m.containerImage })
  );
}

function buildEmbedModal(cfg, kind) {
  const m = cfg[kind];
  return modal(
    `bumpcfg_modal:embed:${kind}`,
    `Embed: ${KIND_LABEL[kind]}`,
    textLabel({ id: "title", label: "Título", max: 256, value: m.embedTitle }),
    textLabel({
      id: "description",
      label: "Descrição",
      style: TextInputStyle.Paragraph,
      max: 4000,
      value: m.embedDescription,
    }),
    textLabel({
      id: "color",
      label: "Cor (hex)",
      description: "Ex.: #5865F2. Vazio = padrão.",
      max: 7,
      value: m.embedColor,
      placeholder: "#5865F2",
    }),
    textLabel({ id: "author", label: "Autor (texto no topo)", max: 256, value: m.embedAuthor }),
    textLabel({ id: "footer", label: "Rodapé", max: 2048, value: m.embedFooter })
  );
}

function buildMediaModal(cfg, kind) {
  const m = cfg[kind];
  const url = "Link direto começando com https://. Vazio = nenhum.";
  return modal(
    `bumpcfg_modal:media:${kind}`,
    `Imagens e links: ${KIND_LABEL[kind]}`,
    textLabel({ id: "image", label: "Imagem grande", description: url, max: 500, value: m.embedImage }),
    textLabel({ id: "thumbnail", label: "Miniatura (canto direito)", description: url, max: 500, value: m.embedThumbnail }),
    textLabel({ id: "url", label: "Link do título", description: url, max: 500, value: m.embedUrl }),
    textLabel({ id: "authorIcon", label: "Ícone do autor", description: url, max: 500, value: m.embedAuthorIcon }),
    textLabel({ id: "footerIcon", label: "Ícone do rodapé", description: url, max: 500, value: m.embedFooterIcon })
  );
}

module.exports = {
  buildBumpHome,
  buildBumpResetConfirm,
  buildBumpChannels,
  buildBumpMessagePage,
  buildTimingModal,
  buildTextModal,
  buildEmbedModal,
  buildContainerStyleModal,
  buildMediaModal,
};
