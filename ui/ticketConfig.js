const {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ActionRowBuilder,
} = require("discord.js");
const { addBackButton } = require("./backButton");
const { MAX_OPTIONS, MAX_IMAGES } = require("../utils/ticketSettings");

const text = (content) => new TextDisplayBuilder().setContent(content);

// Texto curto e seguro para mostrar dentro de `crase`
function short(value, max = 45) {
  if (!value) return "Não definido";
  const clean = String(value).replaceAll("`", "'").replaceAll("\n", " ");
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function rolesText(ids) {
  return ids.length ? ids.map((id) => `<@&${id}>`).join(", ") : "Nenhum";
}

// Section com texto + botão "Definir" ao lado (mesmo estilo dos outros painéis)
function configSection(lines, customId, label = "Definir", { disabled = false, style = ButtonStyle.Secondary } = {}) {
  return new SectionBuilder()
    .addTextDisplayComponents(...lines.map(text))
    .setButtonAccessory(
      new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(label)
        .setStyle(style)
        .setDisabled(disabled)
    );
}

// ---------- Menu principal dos tickets ----------

function buildTicketMenuPanel() {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Sistema de tickets"),
    text("-# Configure tudo do sistema de tickets.")
  );

  const selectContainer = new ContainerBuilder().addTextDisplayComponents(
    text("**Selecione abaixo**"),
    text("-# Configurações do sistema de tickets.")
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId("tcfg_menu")
    .setPlaceholder("Selecione uma opção")
    .addOptions(
      {
        label: "Painel externo",
        description: "Textos e imagens da mensagem onde abrem o ticket.",
        value: "painel",
      },
      {
        label: "Ticket interno",
        description: "Textos, imagens e nome do tópico dentro do ticket.",
        value: "interno",
      },
      {
        label: "Opções do menu",
        description: "Adicionar, editar, ordenar e remover as opções do painel.",
        value: "opcoes",
      },
      {
        label: "Cargos",
        description: "Quem atende os tickets e quem é mencionado.",
        value: "cargos",
      },
      {
        label: "Enviar painel",
        description: "Envie o painel de tickets em um canal.",
        value: "enviar",
      }
    );

  selectContainer.addActionRowComponents(new ActionRowBuilder().addComponents(select));
  addBackButton(selectContainer, "back_main");

  return [header, selectContainer];
}

// ---------- Painel externo ----------

function buildPanelExternoCfg(s) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Painel externo"),
    text("-# Textos e imagens da mensagem onde o membro abre o ticket.")
  );

  const textos = new ContainerBuilder().addSectionComponents(
    configSection(
      [
        "**Textos do painel**",
        "-# Título, descrição e texto do select menu.",
        `-# Título: \`${short(s.panelTitle)}\`\n` +
          `-# Descrição: \`${short(s.panelDescription)}\`\n` +
          `-# Select: \`${short(s.panelPlaceholder)}\``,
      ],
      "tcfg_panel_text"
    )
  );

  const imagens = new ContainerBuilder().addSectionComponents(
    configSection(
      [
        "**Imagens do painel**",
        `-# Até ${MAX_IMAGES} imagens: envie arquivos ou use links.`,
        `-# Imagens: \`${
          s.custom.panelImages ? `${s.panelSources.length} personalizada(s)` : "Padrão"
        }\``,
      ],
      "tcfg_panel_images"
    )
  );

  addBackButton(imagens, "tcfg_back");
  return [header, textos, imagens];
}

// ---------- Ticket interno ----------

function buildInternoCfg(s) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Ticket interno"),
    text("-# Textos e imagens do que aparece dentro do ticket.")
  );

  const textos = new ContainerBuilder().addSectionComponents(
    configSection(
      [
        "**Textos do ticket**",
        "-# Título, mensagem, aviso ao assumir e nome do tópico.\n" +
          "-# Variáveis: `{user}` `{username}` `{option}` `{server}` `{staff}` `{number}`",
        `-# Título: \`${short(s.internalHeading)}\`\n` +
          `-# Mensagem: \`${short(s.internalMessage)}\`\n` +
          `-# Ao assumir: \`${short(s.claimedMessage)}\`\n` +
          `-# Nome do tópico: \`${short(s.threadName)}\``,
      ],
      "tcfg_int_text"
    )
  );

  const imagens = new ContainerBuilder().addSectionComponents(
    configSection(
      [
        "**Imagens do ticket**",
        `-# Até ${MAX_IMAGES} imagens: envie arquivos ou use links.`,
        `-# Imagens: \`${s.internalSources.length ? `${s.internalSources.length} definida(s)` : "Nenhuma"}\``,
      ],
      "tcfg_int_images"
    )
  );

  addBackButton(imagens, "tcfg_back");
  return [header, textos, imagens];
}

// ---------- Opções do ticket ----------

function buildOptionsCfg(s) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Opções do menu"),
    text(`-# Opções do select menu do painel de tickets (até ${MAX_OPTIONS}).`)
  );

  const lista = s.options
    .map(
      (o, i) =>
        `${i + 1}. **${short(o.label, 30)}** · ${o.description ? short(o.description, 40) : "sem descrição"}`
    )
    .join("\n");

  const selectContainer = new ContainerBuilder().addTextDisplayComponents(
    text("**Opções atuais**"),
    text(lista.slice(0, 3000)),
    text("-# Selecione uma opção abaixo para editar, mover ou remover.")
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId("tcfg_opt_select")
    .setPlaceholder("Selecione uma opção")
    .addOptions(
      s.options.slice(0, 25).map((o) => ({ label: o.label.slice(0, 100), value: o.key }))
    );
  selectContainer.addActionRowComponents(new ActionRowBuilder().addComponents(select));

  const novaOpcao = new ContainerBuilder()
    .addSectionComponents(
      configSection(
        [
          "**Nova opção**",
          `-# Adicione uma opção ao menu (${s.options.length}/${MAX_OPTIONS}).`,
        ],
        "tcfg_opt_add",
        "Adicionar",
        { disabled: s.options.length >= MAX_OPTIONS }
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addSectionComponents(
      configSection(
        ["**Remover opções**", "-# Escolha várias opções para remover de uma vez."],
        "tcfg_opt_remove",
        "Remover",
        { disabled: s.options.length <= 1, style: ButtonStyle.Danger }
      )
    );

  addBackButton(novaOpcao, "tcfg_back");
  return [header, selectContainer, novaOpcao];
}

function buildOptionDetail(s, opt) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text(`### Opção: ${short(opt.label, 60)}`),
    text("-# Edite ou remova esta opção do painel.")
  );

  const detalhes = new ContainerBuilder().addTextDisplayComponents(
    text(
      `**Nome:** \`${short(opt.label)}\`\n` +
        `**Descrição:** \`${short(opt.description)}\`\n` +
        `**Título no ticket:** \`${short(opt.title)}\`\n` +
        `**Mensagem própria:** \`${opt.message ? short(opt.message) : "Usa a mensagem padrão"}\``
    )
  );

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`tcfg_opt_edit:${opt.key}`)
      .setLabel("Editar")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`tcfg_opt_del:${opt.key}`)
      .setLabel("Remover")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(s.options.length <= 1)
  );

  detalhes.addSeparatorComponents(new SeparatorBuilder());
  detalhes.addActionRowComponents(buttons);
  addBackButton(detalhes, "tcfg_back_opts");

  return [header, detalhes];
}

// ---------- Cargos ----------

function buildRolesCfg(s) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Cargos do ticket"),
    text("-# Defina quem atende os tickets e quem é mencionado.")
  );

  const attend = new ContainerBuilder().addTextDisplayComponents(
    text("**Cargos de atendimento**"),
    text("-# Cargos que podem assumir e finalizar tickets."),
    text(`-# Atuais${s.custom.attendRoles ? "" : " (padrão)"}: ${rolesText(s.attendRoles)}`)
  );
  attend.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId("tcfg_role_attend")
        .setPlaceholder("Selecione os cargos de atendimento")
        .setMinValues(0)
        .setMaxValues(25)
    )
  );

  const mention = new ContainerBuilder().addTextDisplayComponents(
    text("**Cargos mencionados**"),
    text("-# Cargos marcados no canal quando um ticket é aberto (eles entram no ticket)."),
    text(`-# Atuais${s.custom.mentionRoles ? "" : " (padrão)"}: ${rolesText(s.mentionRoles)}`)
  );
  mention.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId("tcfg_role_mention")
        .setPlaceholder("Selecione os cargos mencionados")
        .setMinValues(0)
        .setMaxValues(25)
    )
  );

  const restore = new ContainerBuilder().addSectionComponents(
    configSection(
      ["**Restaurar padrão**", "-# Volta os dois campos para os cargos originais do ticket."],
      "tcfg_roles_reset",
      "Restaurar"
    )
  );
  addBackButton(restore, "tcfg_back");

  return [header, attend, mention, restore];
}

// ---------- Enviar painel ----------

function buildSendCfg(s, note = null) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Enviar painel"),
    text("-# Envie o painel de tickets em um canal.")
  );

  const container = new ContainerBuilder().addTextDisplayComponents(
    text("**Canal de destino**"),
    text("-# Selecione o canal onde o painel será enviado."),
    text(
      `-# Painéis ativos: ${
        s.panels.length ? s.panels.map((p) => `<#${p.channelId}>`).join(", ") : "Nenhum"
      }`
    )
  );
  if (note) container.addTextDisplayComponents(text(`-# ${note}`));

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("tcfg_send_channel")
        .setPlaceholder("Selecione o canal do painel")
        .addChannelTypes(ChannelType.GuildText)
    )
  );

  addBackButton(container, "tcfg_back");
  return [header, container];
}

module.exports = {
  buildTicketMenuPanel,
  buildPanelExternoCfg,
  buildInternoCfg,
  buildOptionsCfg,
  buildOptionDetail,
  buildRolesCfg,
  buildSendCfg,
};
