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
const {
  MAX_OPTIONS,
  MAX_IMAGES,
  MAX_PANELS,
  BUTTON_STYLES,
  ARCHIVE_OPTIONS,
  DEFAULTS,
  colorName,
} = require("../utils/ticketSettings");

const GREEN = 0x00c853;
const RED = 0xe50000;
const WHITE = 0xffffff;

const text = (content) => new TextDisplayBuilder().setContent(String(content).slice(0, 3500));

// Texto curto e seguro para mostrar dentro de `crase`
function short(value, max = 45) {
  if (value == null || value === "") return "Não definido";
  const clean = String(value).replaceAll("`", "'").replaceAll("\n", " ");
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

const rolesText = (ids) => (ids.length ? ids.map((id) => `<@&${id}>`).join(" ") : "`Nenhum`");
const yesNo = (value) => (value ? "Sim" : "Não");
const modeLabel = (panel) => (panel.mode === "button" ? "Botão" : "Select menu");

function button(customId, label, { style = ButtonStyle.Secondary, disabled = false } = {}) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style).setDisabled(disabled);
}

// Linha de configuração: texto à esquerda, botão à direita
function item(lines, customId, label = "Editar", opts = {}) {
  return new SectionBuilder()
    .addTextDisplayComponents(text(lines.join("\n")))
    .setButtonAccessory(button(customId, label, opts));
}

const sep = () => new SeparatorBuilder();

function tabHeader(title, panel, hint) {
  return new ContainerBuilder().addTextDisplayComponents(
    text(`## ${title}`),
    text(`-# Painel: ${panel.name}${hint ? ` · ${hint}` : ""}`)
  );
}

// Cor do container de acordo com o estado do painel
function stateColor(panel) {
  if (!panel.enabled) return RED;
  return panel.sent.length ? GREEN : WHITE;
}

function stateText(panel) {
  if (!panel.enabled) return "Desativado";
  return panel.sent.length ? "Ativo" : "Ativo, ainda não enviado";
}

// ---------- Lista de painéis ----------

function buildTicketHome({ panels, openByPanel = {} }) {
  const totalOpen = Object.values(openByPanel).reduce((sum, n) => sum + n, 0);
  const totalSent = panels.reduce((sum, p) => sum + p.sent.length, 0);

  const header = new ContainerBuilder().addTextDisplayComponents(
    text("## Sistema de tickets"),
    text("-# Crie vários painéis de atendimento, com abertura por select menu ou botão.")
  );

  const overview = new ContainerBuilder().addTextDisplayComponents(
    text(
      `**Visão geral**\n-# Painéis: \`${panels.length}/${MAX_PANELS}\` · Mensagens enviadas: \`${totalSent}\` · Tickets abertos agora: \`${totalOpen}\``
    )
  );

  const list = new ContainerBuilder();
  if (!panels.length) {
    list.addTextDisplayComponents(
      text("### Seus painéis"),
      text("-# Você ainda não criou nenhum painel. Clique em **Criar** para começar.")
    );
  } else {
    list.addTextDisplayComponents(
      text("### Seus painéis"),
      text(
        panels
          .map((p) => {
            const opts = p.mode === "select" ? ` · ${p.options.length} opção(ões)` : "";
            return `**${short(p.name, 40)}** · ${modeLabel(p)}${opts} · ${stateText(p)} · abertos: \`${openByPanel[p.id] ?? 0}\``;
          })
          .join("\n")
      )
    );

    const select = new StringSelectMenuBuilder()
      .setCustomId("tcfg_pick")
      .setPlaceholder("Selecione um painel para editar")
      .addOptions(
        panels.slice(0, 25).map((p) => ({
          label: p.name.slice(0, 100),
          description: `${modeLabel(p)} · ${p.sent.length} mensagem(ns) enviada(s) · ${p.enabled ? "Ativo" : "Desativado"}`.slice(0, 100),
          value: p.id,
        }))
      );
    list.addActionRowComponents(new ActionRowBuilder().addComponents(select));
  }

  list.addSeparatorComponents(sep());
  list.addSectionComponents(
    item(
      ["**Novo painel**", "-# Crie outro painel de abertura de tickets."],
      "tcfg_new",
      "Criar",
      { disabled: panels.length >= MAX_PANELS }
    )
  );
  addBackButton(list, "back_moderacao");

  return [header, overview, list];
}

// ---------- Painel selecionado ----------

function buildPanelManager({ panel, open = 0 }) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text(`## ${short(panel.name, 60)}`),
    text(`-# Painel de tickets · Abertura por ${modeLabel(panel).toLowerCase()}`)
  );

  const sentText = panel.sent.length
    ? panel.sent.slice(0, 4).map((r) => `<#${r.channelId}>`).join(" ")
    : "`Ainda não enviado`";

  const overview = new ContainerBuilder()
    .setAccentColor(stateColor(panel))
    .addTextDisplayComponents(
      text(
        [
          "**Visão geral**",
          `-# Estado: \`${stateText(panel)}\` · Abertura: \`${modeLabel(panel)}\` · ${
            panel.mode === "select" ? `Opções: \`${panel.options.length}\`` : `Botão: \`${short(panel.buttonLabel, 25)}\``
          }`,
          `-# Atendimento: ${rolesText(panel.attendRoles)}`,
          `-# Marcados ao abrir: ${rolesText(panel.mentionRoles)}`,
          `-# Imagens: \`${panel.panelSources.length}\` no painel, \`${panel.internalSources.length}\` no ticket · Cor: \`${colorName(panel.color)}\``,
          `-# Limite por pessoa: \`${panel.maxPerUser === 0 ? "Sem limite" : panel.maxPerUser}\` · Motivo ao abrir: \`${yesNo(panel.askReason)}\``,
          `-# Enviado em: ${sentText}`,
          `-# Tickets abertos agora: \`${open}\``,
        ].join("\n")
      )
    )
    .addSeparatorComponents(sep())
    .addSectionComponents(
      item(
        ["**Prévia do painel**", "-# Veja como o painel aparece para os membros."],
        `tcfg_prev:${panel.id}`,
        "Ver prévia"
      )
    );

  const select = new StringSelectMenuBuilder()
    .setCustomId(`tcfg_sect:${panel.id}`)
    .setPlaceholder("Selecione uma opção")
    .addOptions(
      {
        label: "Aparência do painel",
        description: "Título, descrição, cor, imagens e rodapé.",
        value: "aparencia",
      },
      {
        label: "Abertura",
        description: "Select menu ou botão, textos e estilo.",
        value: "abertura",
      },
      {
        label: panel.mode === "button" ? "Conteúdo do ticket" : "Opções do menu",
        description:
          panel.mode === "button"
            ? "Título e mensagem do ticket aberto pelo botão."
            : "Adicionar, editar, ordenar e remover as opções.",
        value: "opcoes",
      },
      {
        label: "Ticket interno",
        description: "Textos, imagens, canal e arquivamento do tópico.",
        value: "interno",
      },
      {
        label: "Mensagens do sistema",
        description: "Confirmação ao abrir, ao excluir e aviso de limite.",
        value: "sucesso",
      },
      {
        label: "Cargos",
        description: "Quem atende e quem é marcado nos tickets.",
        value: "cargos",
      },
      {
        label: "Regras e limites",
        description: "Limite por pessoa, motivo ao abrir e confirmação.",
        value: "regras",
      },
      {
        label: "Publicação",
        description: "Enviar o painel em um canal e gerenciar os enviados.",
        value: "publicacao",
      },
      {
        label: "Gerenciar painel",
        description: "Renomear, duplicar ou excluir este painel.",
        value: "gerenciar",
      }
    );

  const selectContainer = new ContainerBuilder()
    .addTextDisplayComponents(
      text("### Selecione abaixo"),
      text("-# Selecione o que deseja configurar neste painel.")
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(select));
  addBackButton(selectContainer, "tcfg_home");

  return [header, overview, selectContainer];
}

// ---------- Aparência ----------

function buildSecAparencia(panel) {
  const container = new ContainerBuilder()
    .addSectionComponents(
      item(
        [
          "**Textos do painel**",
          `-# Título: \`${short(panel.title)}\``,
          `-# Descrição: \`${short(panel.description)}\``,
          `-# Rodapé: \`${short(panel.footer)}\``,
        ],
        `tcfg_a_text:${panel.id}`
      )
    )
    .addSeparatorComponents(sep())
    .addSectionComponents(
      item(
        ["**Cor do painel**", `-# Barra lateral: \`${colorName(panel.color)}\``],
        `tcfg_a_color:${panel.id}`
      )
    )
    .addSeparatorComponents(sep())
    .addSectionComponents(
      item(
        [
          "**Imagens do painel**",
          `-# Até ${MAX_IMAGES} imagens: envie arquivos ou use links.`,
          `-# Imagens: \`${panel.panelSources.length ? `${panel.panelSources.length} definida(s)` : "Nenhuma"}\``,
        ],
        `tcfg_a_images:${panel.id}`
      )
    )
    .addSeparatorComponents(sep())
    .addSectionComponents(
      item(
        [
          "**Informações automáticas**",
          "-# Mostra como funciona e a lista de categorias no painel.",
          `-# Estado: \`${panel.showInfo ? "Ativadas" : "Desativadas"}\``,
        ],
        `tcfg_a_info:${panel.id}`,
        panel.showInfo ? "Desativar" : "Ativar"
      )
    );
  addBackButton(container, `tcfg_manage:${panel.id}`);

  return [tabHeader("Aparência do painel", panel, "o que os membros veem"), container];
}

// ---------- Abertura ----------

function buildSecAbertura(panel) {
  const container = new ContainerBuilder().addSectionComponents(
    item(
      [
        "**Tipo de abertura**",
        `-# Atual: \`${modeLabel(panel)}\``,
        "-# Select menu deixa o membro escolher uma categoria. Botão abre o ticket com um clique.",
      ],
      `tcfg_m_mode:${panel.id}`,
      "Alterar"
    )
  );

  container.addSeparatorComponents(sep());
  if (panel.mode === "button") {
    container.addSectionComponents(
      item(
        [
          "**Botão**",
          `-# Texto: \`${short(panel.buttonLabel, 30)}\``,
          `-# Cor: \`${BUTTON_STYLES[panel.buttonStyle]}\``,
        ],
        `tcfg_m_btn:${panel.id}`
      )
    );
  } else {
    container.addSectionComponents(
      item(
        ["**Select menu**", `-# Texto do menu: \`${short(panel.placeholder, 40)}\``],
        `tcfg_m_ph:${panel.id}`
      )
    );
  }
  addBackButton(container, `tcfg_manage:${panel.id}`);

  return [tabHeader("Abertura", panel, "como o ticket é aberto"), container];
}

// ---------- Opções do menu (ou conteúdo do ticket, no modo botão) ----------

function buildSecOpcoes(panel) {
  // Modo botão: um único "tipo" de ticket
  if (panel.mode === "button") {
    const opt = panel.options[0];
    const container = new ContainerBuilder().addSectionComponents(
      item(
        [
          "**Conteúdo do ticket**",
          `-# Nome: \`${short(opt.label)}\``,
          `-# Título no ticket: \`${short(opt.title)}\``,
          `-# Mensagem: \`${short(opt.message ?? "Usa a mensagem padrão", 60)}\``,
        ],
        `tcfg_o_edit:${panel.id}:${opt.key}`
      )
    );
    addBackButton(container, `tcfg_manage:${panel.id}`);
    return [tabHeader("Conteúdo do ticket", panel, "aberto pelo botão"), container];
  }

  const container = new ContainerBuilder().addTextDisplayComponents(
    text(`**Opções do menu** (${panel.options.length}/${MAX_OPTIONS})`),
    text(
      panel.options
        .map((o, i) => `${i + 1}. **${short(o.label, 30)}**${o.description ? ` · ${short(o.description, 40)}` : ""}`)
        .join("\n")
    )
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId(`tcfg_o_pick:${panel.id}`)
    .setPlaceholder("Selecione uma opção para editar")
    .addOptions(
      panel.options.slice(0, 25).map((o) => {
        const entry = { label: o.label.slice(0, 100), value: o.key };
        if (o.description) entry.description = o.description.slice(0, 100);
        return entry;
      })
    );
  container.addActionRowComponents(new ActionRowBuilder().addComponents(select));

  container
    .addSeparatorComponents(sep())
    .addSectionComponents(
      item(
        ["**Nova opção**", `-# Adicione uma opção ao menu (${panel.options.length}/${MAX_OPTIONS}).`],
        `tcfg_o_add:${panel.id}`,
        "Adicionar",
        { disabled: panel.options.length >= MAX_OPTIONS }
      )
    )
    .addSeparatorComponents(sep())
    .addSectionComponents(
      item(
        ["**Remover opções**", "-# Escolha várias para remover de uma vez."],
        `tcfg_o_rmopen:${panel.id}`,
        "Remover",
        { style: ButtonStyle.Danger, disabled: panel.options.length <= 1 }
      )
    );
  addBackButton(container, `tcfg_manage:${panel.id}`);

  return [tabHeader("Opções do menu", panel, "categorias de atendimento"), container];
}

function buildOptionDetail(panel, opt) {
  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(`tcfg_o_roles:${panel.id}:${opt.key}`)
    .setPlaceholder("Cargos desta opção (opcional)")
    .setMinValues(0)
    .setMaxValues(10);
  if (opt.staffRoles?.length) roleSelect.setDefaultRoles(...opt.staffRoles.slice(0, 10));

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text(`### ${short(opt.label, 60)}`),
      text(
        [
          `-# Descrição: \`${short(opt.description)}\``,
          `-# Título no ticket: \`${short(opt.title)}\``,
          `-# Mensagem: \`${short(opt.message ?? "Usa a mensagem padrão", 70)}\``,
          `-# Cargos: ${opt.staffRoles?.length ? rolesText(opt.staffRoles) : "`Usa os cargos do painel`"}`,
        ].join("\n")
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        button(`tcfg_o_edit:${panel.id}:${opt.key}`, "Editar"),
        button(`tcfg_o_del:${panel.id}:${opt.key}`, "Remover", {
          style: ButtonStyle.Danger,
          disabled: panel.options.length <= 1,
        }),
        button(`tcfg_o_rolesreset:${panel.id}:${opt.key}`, "Usar cargos do painel", {
          disabled: !opt.staffRoles?.length,
        })
      )
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(roleSelect));
  addBackButton(container, `tcfg_go:${panel.id}:opcoes`);

  return [tabHeader("Editar opção", panel, "cargos próprios são marcados e podem atender"), container];
}

// ---------- Ticket interno ----------

function buildSecInterno(panel, guild) {
  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(`tcfg_i_chan:${panel.id}`)
    .setPlaceholder("Canal onde os tópicos são criados")
    .setChannelTypes(ChannelType.GuildText)
    .setMinValues(1)
    .setMaxValues(1);
  if (panel.ticketChannelId && guild?.channels.cache.has(panel.ticketChannelId)) {
    channelSelect.setDefaultChannels(panel.ticketChannelId);
  }

  const container = new ContainerBuilder()
    .addSectionComponents(
      item(
        [
          "**Textos do ticket**",
          `-# Título: \`${short(panel.internalHeading)}\``,
          `-# Mensagem: \`${short(panel.internalMessage)}\``,
          `-# Aviso ao assumir: \`${short(panel.claimedMessage)}\``,
          `-# Nome do tópico: \`${short(panel.threadName)}\``,
        ],
        `tcfg_i_text:${panel.id}`
      )
    )
    .addSeparatorComponents(sep())
    .addSectionComponents(
      item(
        [
          "**Imagens do ticket**",
          `-# Até ${MAX_IMAGES} imagens: envie arquivos ou use links.`,
          `-# Imagens: \`${panel.internalSources.length ? `${panel.internalSources.length} definida(s)` : "Nenhuma"}\``,
        ],
        `tcfg_i_images:${panel.id}`
      )
    )
    .addSeparatorComponents(sep())
    .addSectionComponents(
      item(
        [
          "**Arquivamento automático**",
          `-# Tópico arquiva após \`${ARCHIVE_OPTIONS[panel.archiveMinutes]}\` sem mensagens.`,
        ],
        `tcfg_i_arch:${panel.id}`,
        "Alterar"
      )
    )
    .addSeparatorComponents(sep())
    .addSectionComponents(
      item(
        [
          "**Linha \"Aberto por\"**",
          "-# Mostra quem abriu o ticket, dentro do ticket.",
          `-# Estado: \`${panel.showAuthorLine ? "Ativada" : "Desativada"}\``,
        ],
        `tcfg_i_authorline:${panel.id}`,
        panel.showAuthorLine ? "Desativar" : "Ativar"
      )
    )
    .addSeparatorComponents(sep())
    .addSectionComponents(
      item(
        [
          "**Linha \"Opção selecionada\"**",
          "-# Mostra qual categoria o membro escolheu, dentro do ticket.",
          `-# Estado: \`${panel.showOptionLine ? "Ativada" : "Desativada"}\``,
        ],
        `tcfg_i_optline:${panel.id}`,
        panel.showOptionLine ? "Desativar" : "Ativar"
      )
    )
    .addSeparatorComponents(sep())
    .addSectionComponents(
      item(
        [
          "**Rodapé do ticket**",
          "-# Texto pequeno: nome do painel, número e quando foi aberto.",
          `-# Estado: \`${panel.showTicketFooter ? "Ativado" : "Desativado"}\``,
        ],
        `tcfg_i_footer:${panel.id}`,
        panel.showTicketFooter ? "Desativar" : "Ativar"
      )
    )
    .addSeparatorComponents(sep())
    .addSectionComponents(
      item(
        ["**Cor do ticket**", `-# Barra lateral: \`${colorName(panel.internalColor)}\``, "-# Não muda ao assumir."],
        `tcfg_color:${panel.id}:internalColor`
      )
    )
    .addSeparatorComponents(sep())
    .addSectionComponents(
      item(
        ["**Cor ao assumir**", `-# Barra lateral da mensagem de "assumido": \`${colorName(panel.claimedColor)}\``],
        `tcfg_color:${panel.id}:claimedColor`
      )
    )
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      text(
        `**Canal dos tickets**\n-# Atual: ${
          panel.ticketChannelId ? `<#${panel.ticketChannelId}>` : "`O mesmo canal do painel`"
        }`
      )
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(channelSelect))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        button(`tcfg_i_chanreset:${panel.id}`, "Usar o canal do painel", {
          disabled: !panel.ticketChannelId,
        })
      )
    );
  addBackButton(container, `tcfg_manage:${panel.id}`);

  return [tabHeader("Ticket interno", panel, "dentro do tópico"), container];
}

// ---------- Mensagem de sucesso ----------

function buildSecSucesso(panel) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text("**Ao abrir o ticket**"))
    .addSectionComponents(
      item(
        [
          "Textos da confirmação",
          `-# Título: \`${short(panel.successTitle)}\``,
          `-# Mensagem: \`${short(panel.successMessage, 60)}\``,
        ],
        `tcfg_su_text:${panel.id}`
      )
    )
    .addSeparatorComponents(sep())
    .addSectionComponents(
      item(
        ["Cor da confirmação", `-# Barra lateral: \`${colorName(panel.successColor)}\``],
        `tcfg_color:${panel.id}:successColor`
      )
    )
    .addSeparatorComponents(sep())
    .addSectionComponents(
      item(
        [
          "Botão para o ticket",
          `-# Texto: \`${short(panel.successButtonLabel, 30)}\``,
          `-# Estado: \`${panel.successButtonEnabled ? "Ativado" : "Desativado"}\``,
        ],
        `tcfg_su_btn:${panel.id}`,
        "Editar texto",
        { disabled: !panel.successButtonEnabled }
      )
    )
    .addSeparatorComponents(sep())
    .addSectionComponents(
      item(
        ["Mostrar botão", "-# Desative para a confirmação aparecer sem o botão de ir ao ticket."],
        `tcfg_su_toggle:${panel.id}`,
        panel.successButtonEnabled ? "Desativar" : "Ativar",
        { style: panel.successButtonEnabled ? ButtonStyle.Danger : ButtonStyle.Success }
      )
    )
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(text("**Ao finalizar o ticket**"))
    .addSectionComponents(
      item(
        [
          "Textos e botão da confirmação",
          `-# Título: \`${short(panel.closeConfirmTitle)}\``,
          `-# Mensagem: \`${short(panel.closeConfirmMessage, 60)}\``,
          `-# Botão: \`${short(panel.closeConfirmButtonLabel, 30)}\``,
        ],
        `tcfg_cc_text:${panel.id}`
      )
    )
    .addSeparatorComponents(sep())
    .addSectionComponents(
      item(
        ["Cor da confirmação", `-# Barra lateral: \`${colorName(panel.closeConfirmColor)}\``],
        `tcfg_color:${panel.id}:closeConfirmColor`
      )
    )
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(text("**Limite de tickets atingido**"))
    .addSectionComponents(
      item(
        [
          "Textos do aviso",
          `-# Título: \`${short(panel.limitTitle)}\``,
          `-# Mensagem: \`${short(panel.limitMessage, 60)}\``,
        ],
        `tcfg_lim_text:${panel.id}`
      )
    )
    .addSeparatorComponents(sep())
    .addSectionComponents(
      item(
        ["Cor do aviso", `-# Barra lateral: \`${colorName(panel.limitColor)}\``],
        `tcfg_color:${panel.id}:limitColor`
      )
    );
  addBackButton(container, `tcfg_manage:${panel.id}`);

  return [tabHeader("Mensagens do sistema", panel, "confirmação ao abrir, excluir e limite"), container];
}

// ---------- Cargos ----------

function buildSecCargos(panel) {
  const attend = new RoleSelectMenuBuilder()
    .setCustomId(`tcfg_r_attend:${panel.id}`)
    .setPlaceholder("Cargos que podem assumir e finalizar")
    .setMinValues(0)
    .setMaxValues(10);
  if (panel.attendRoles.length) attend.setDefaultRoles(...panel.attendRoles.slice(0, 10));

  const mention = new RoleSelectMenuBuilder()
    .setCustomId(`tcfg_r_mention:${panel.id}`)
    .setPlaceholder("Cargos marcados quando abrir um ticket")
    .setMinValues(0)
    .setMaxValues(10);
  if (panel.mentionRoles.length) mention.setDefaultRoles(...panel.mentionRoles.slice(0, 10));

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text(`**Atendimento**\n-# Podem assumir e finalizar: ${rolesText(panel.attendRoles)}`)
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(attend))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        button(`tcfg_r_reset:${panel.id}:attend`, "Restaurar padrão", { disabled: !panel.custom.attendRoles })
      )
    )
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      text(`**Marcações**\n-# Marcados ao abrir um ticket: ${rolesText(panel.mentionRoles)}`)
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(mention))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        button(`tcfg_r_reset:${panel.id}:mention`, "Restaurar padrão", { disabled: !panel.custom.mentionRoles })
      )
    );
  addBackButton(container, `tcfg_manage:${panel.id}`);

  return [tabHeader("Cargos", panel, "padrão do painel"), container];
}

// ---------- Regras e limites ----------

function buildSecRegras(panel) {
  const container = new ContainerBuilder()
    .addSectionComponents(
      item(
        [
          "**Limite por pessoa**",
          `-# Tickets abertos ao mesmo tempo: \`${panel.maxPerUser === 0 ? "Sem limite" : panel.maxPerUser}\``,
        ],
        `tcfg_g_limit:${panel.id}`,
        "Alterar"
      )
    )
    .addSeparatorComponents(sep())
    .addSectionComponents(
      item(
        [
          "**Perguntar o motivo ao abrir**",
          "-# O membro descreve o motivo antes do ticket ser criado.",
          `-# Estado: \`${panel.askReason ? "Ativado" : "Desativado"}\``,
        ],
        `tcfg_g_reason:${panel.id}`,
        panel.askReason ? "Desativar" : "Ativar"
      )
    )
    .addSeparatorComponents(sep())
    .addSectionComponents(
      item(
        [
          "**Confirmar antes de finalizar**",
          "-# A equipe confirma antes do tópico ser excluído.",
          `-# Estado: \`${panel.confirmClose ? "Ativado" : "Desativado"}\``,
        ],
        `tcfg_g_confirm:${panel.id}`,
        panel.confirmClose ? "Desativar" : "Ativar"
      )
    )
    .addSeparatorComponents(sep())
    .addSectionComponents(
      item(
        [
          "**Painel ativo**",
          "-# Desativado, o painel continua visível mas ninguém consegue abrir tickets.",
          `-# Estado: \`${panel.enabled ? "Ativo" : "Desativado"}\``,
        ],
        `tcfg_g_enabled:${panel.id}`,
        panel.enabled ? "Desativar" : "Ativar",
        { style: panel.enabled ? ButtonStyle.Danger : ButtonStyle.Success }
      )
    );
  addBackButton(container, `tcfg_manage:${panel.id}`);

  return [tabHeader("Regras e limites", panel, "como os tickets funcionam"), container];
}

// ---------- Publicação ----------

function buildSecPublicacao(panel, guild) {
  const sendSelect = new ChannelSelectMenuBuilder()
    .setCustomId(`tcfg_s_send:${panel.id}`)
    .setPlaceholder("Selecione o canal para enviar o painel")
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1);

  const sentLines = panel.sent.length
    ? panel.sent
        .slice(-6)
        .map(
          (r) =>
            `• <#${r.channelId}> · [abrir mensagem](https://discord.com/channels/${guild?.id ?? panel.guildId}/${r.channelId}/${r.messageId})`
        )
        .join("\n")
    : "`Nenhuma mensagem enviada ainda`";

  const container = new ContainerBuilder()
    .setAccentColor(stateColor(panel))
    .addTextDisplayComponents(
      text("**Enviar painel**\n-# Escolha o canal. O painel enviado é atualizado sozinho quando você edita a configuração."),
      text(`**Mensagens enviadas** (${panel.sent.length})\n${sentLines}`)
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(sendSelect))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        button(`tcfg_s_refresh:${panel.id}`, "Atualizar enviados", { disabled: !panel.sent.length }),
        button(`tcfg_s_clear:${panel.id}`, "Apagar enviados", {
          style: ButtonStyle.Danger,
          disabled: !panel.sent.length,
        })
      )
    );
  addBackButton(container, `tcfg_manage:${panel.id}`);

  return [tabHeader("Publicação", panel, "onde o painel fica"), container];
}

// ---------- Gerenciar ----------

function buildSecGerenciar(panel) {
  const container = new ContainerBuilder()
    .addSectionComponents(
      item(["**Renomear**", `-# Nome atual: \`${short(panel.name)}\``], `tcfg_x_rename:${panel.id}`, "Renomear")
    )
    .addSeparatorComponents(sep())
    .addSectionComponents(
      item(
        ["**Duplicar**", "-# Cria uma cópia com as mesmas configurações, sem enviar."],
        `tcfg_x_dup:${panel.id}`,
        "Duplicar"
      )
    )
    .addSeparatorComponents(sep())
    .addSectionComponents(
      item(
        ["**Excluir**", "-# Remove o painel, suas imagens e as mensagens enviadas."],
        `tcfg_x_del:${panel.id}`,
        "Excluir",
        { style: ButtonStyle.Danger }
      )
    );
  addBackButton(container, `tcfg_manage:${panel.id}`);

  return [tabHeader("Gerenciar painel", panel, "ações do painel"), container];
}

function buildDeleteConfirm(panel, open = 0) {
  const container = new ContainerBuilder()
    .setAccentColor(RED)
    .addTextDisplayComponents(
      text(`### Excluir "${short(panel.name, 40)}"?`),
      text(
        [
          "-# Esta ação não pode ser desfeita.",
          `-# Serão apagados: as configurações, \`${panel.panelSources.length + panel.internalSources.length}\` imagem(ns) enviada(s) e \`${panel.sent.length}\` mensagem(ns) do painel.`,
          open ? `-# Existem \`${open}\` ticket(s) abertos: eles continuam funcionando com as configurações padrão.` : "",
        ]
          .filter(Boolean)
          .join("\n")
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        button(`tcfg_x_delok:${panel.id}`, "Confirmar exclusão", { style: ButtonStyle.Danger }),
        button(`tcfg_go:${panel.id}:gerenciar`, "Cancelar")
      )
    );

  return [tabHeader("Excluir painel", panel), container];
}

const SECTIONS = {
  aparencia: buildSecAparencia,
  abertura: buildSecAbertura,
  opcoes: buildSecOpcoes,
  interno: buildSecInterno,
  sucesso: buildSecSucesso,
  cargos: buildSecCargos,
  regras: buildSecRegras,
  publicacao: buildSecPublicacao,
  gerenciar: buildSecGerenciar,
};

// O Discord limita a 40 componentes por mensagem (contando os aninhados:
// container, seção, texto, botão, separador, linha de ações...).
const MAX_COMPONENTS = 40;

function countComponents(builder) {
  const json = typeof builder.toJSON === "function" ? builder.toJSON() : builder;
  const walk = (c) =>
    1 + (c.components ?? []).reduce((sum, x) => sum + walk(x), 0) + (c.accessory ? walk(c.accessory) : 0);
  return walk(json);
}

// Se a tela passar do limite, remove separadores (do fim para o começo),
// preservando o último, que fica acima do botão "Voltar".
function fitComponentLimit(blocks) {
  let total = blocks.reduce((sum, b) => sum + countComponents(b), 0);
  if (total <= MAX_COMPONENTS) return blocks;

  for (let b = blocks.length - 1; b >= 0 && total > MAX_COMPONENTS; b--) {
    const list = blocks[b].components;
    if (!Array.isArray(list)) continue;
    const isSep = (c) => c instanceof SeparatorBuilder;
    const lastSep = list.map(isSep).lastIndexOf(true);
    for (let i = list.length - 1; i >= 0 && total > MAX_COMPONENTS; i--) {
      if (isSep(list[i]) && i !== lastSep) {
        list.splice(i, 1);
        total -= 1;
      }
    }
  }
  return blocks;
}

function buildSection(section, panel, guild) {
  const build = SECTIONS[section] ?? SECTIONS.aparencia;
  return fitComponentLimit(build(panel, guild));
}

module.exports = {
  buildTicketHome,
  buildPanelManager,
  buildSection,
  buildSecAparencia,
  buildSecInterno,
  buildOptionDetail,
  buildDeleteConfirm,
  DEFAULTS,
};
