const {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelType,
  ActionRowBuilder,
} = require("discord.js");
const { addBackButton } = require("./backButton");
const { VARIABLES } = require("../utils/formatMessage");
const { TOKENS } = require("../utils/portariaTemplate");
const { FIELDS, thumbLabel, resolveSettings } = require("../utils/portariaSettings");
const { colorName } = require("../utils/ticketSettings");

const text = (content) => new TextDisplayBuilder().setContent(String(content).slice(0, 3500));

function button(customId, label, { style = ButtonStyle.Secondary, disabled = false } = {}) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style).setDisabled(disabled);
}

// Texto curto e seguro para mostrar dentro de `crase`
function short(value, max = 80) {
  if (!value) return "Não definida";
  const clean = String(value).replaceAll("`", "'").replaceAll("\n", " ");
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function tabHeader(title, tabName) {
  return new ContainerBuilder().addTextDisplayComponents(
    text(`## ${title}`),
    text(`-# Você está na aba de configurações de **${tabName}** do bot.`)
  );
}

const stateOf = (enabled, ready = true) => (!ready ? "Sem configuração" : enabled ? "Ativo" : "Desativado");

function formatDelay(seconds) {
  if (!seconds) return "Não apaga";
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${min}min ${rest}s` : `${min}min`;
}

function channelSelect(customId, channelId, guild, placeholder) {
  const select = new ChannelSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1);
  if (channelId && guild.channels.cache.has(channelId)) select.setDefaultChannels(channelId);
  return new ActionRowBuilder().addComponents(select);
}

function variablesContainer() {
  return new ContainerBuilder().addTextDisplayComponents(
    text("### Variáveis e marcadores"),
    text(
      [
        "-# Use no título, na mensagem e no rodapé. São trocados automaticamente.",
        ...VARIABLES.map(([key, desc]) => `\`${key}\` · ${desc}`),
      ].join("\n")
    ),
    text(TOKENS.map(([key, desc]) => `\`${key}\` · ${desc}`).join("\n"))
  );
}

// Resumo do que está configurado (o que o dono escreveu ou o padrão)
function appearanceSummary(kind, config) {
  const f = FIELDS[kind];
  const settings = resolveSettings(kind, config);
  const show = (value, fallback) => (value === "" ? `\`${fallback}\`` : `\`${short(value, 70)}\``);
  const isCustom = (field) => config[field] != null;
  const tag = (field) => (isCustom(field) ? "" : " (padrão)");

  return [
    `**Título:** ${show(settings.title, "Sem título")}${tag(f.title)}`,
    `**Mensagem:** ${show(settings.message, "Sem mensagem")}${tag(f.message)}`,
    `**Rodapé:** ${show(settings.footer, "Sem rodapé")}${tag(f.footer)}`,
    `**Cor:** ${colorName(settings.color)} · **Miniatura:** ${thumbLabel(settings.thumb)}`,
    `**Imagens:** ${settings.images.length} · **Formato:** ${settings.style === "container" ? "Container" : "Texto"}`,
  ].join("\n");
}

// Linhas de botões de aparência (iguais para boas-vindas, saídas e DM)
function appearanceRows(kind, config, { withDelay = false } = {}) {
  const f = FIELDS[kind];
  const style = config[f.style] === "text" ? "text" : "container";
  const rows = [
    new ActionRowBuilder().addComponents(
      button(`port_msg:${kind}`, "Textos"),
      button(`port_color:${kind}`, "Cor"),
      button(`port_img:${kind}`, "Imagens"),
      button(`port_thumb:${kind}`, "Miniatura", { disabled: style !== "container" })
    ),
  ];
  const second = [button(`port_style:${kind}`, `Formato: ${style === "container" ? "Container" : "Texto"}`)];
  if (withDelay) second.push(button(`port_delay:${kind}`, `Apagar: ${formatDelay(config[f.delay])}`));
  rows.push(new ActionRowBuilder().addComponents(...second));
  return rows;
}

// ---------- Painel principal ----------

function buildPortariaPanel(guild, config) {
  const welcomeReady = Boolean(config.welcomeChannel);
  const leaveReady = Boolean(config.leaveChannel);
  const where = (id) => (id ? `<#${id}>` : "`Não definido`");

  const header = new ContainerBuilder().addTextDisplayComponents(
    text("## Portaria"),
    text("-# Defina o que acontece quando alguém entra ou sai do servidor.")
  );

  const summary = new ContainerBuilder().addTextDisplayComponents(
    text("**Situação atual**"),
    text(
      [
        `**Boas-vindas:** ${where(config.welcomeChannel)} · ${stateOf(config.welcomeEnabled, welcomeReady)}`,
        `**Saídas:** ${where(config.leaveChannel)} · ${stateOf(config.leaveEnabled, leaveReady)}`,
        `**DM de boas-vindas:** ${stateOf(config.dmEnabled)}`,
        `**Cargos de bots:** ${config.botAutoRoles.length ? config.botAutoRoles.map((r) => `<@&${r}>`).join(", ") : "`Nenhum`"}`,
        `**Filtro de contas novas:** ${
          config.accountFilterEnabled ? `Ativo (mínimo de ${config.accountMinAgeDays} dia(s))` : "Desativado"
        }`,
      ].join("\n")
    )
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId("port_menu")
    .setPlaceholder("Selecione uma opção")
    .addOptions(
      {
        label: "Boas-vindas",
        description: `${stateOf(config.welcomeEnabled, welcomeReady)} · Mensagem ao entrar no canal escolhido.`,
        value: "welcome",
      },
      {
        label: "Saídas",
        description: `${stateOf(config.leaveEnabled, leaveReady)} · Mensagem quando alguém sai do servidor.`,
        value: "leave",
      },
      {
        label: "DM de boas-vindas",
        description: `${stateOf(config.dmEnabled)} · Mensagem privada para quem entrou.`,
        value: "dm",
      },
      {
        label: "Cargos de bots",
        description: "Cargos automáticos só para bots que entram.",
        value: "bots",
      },
      {
        label: "Filtro de contas novas",
        description: `${config.accountFilterEnabled ? "Ativo" : "Desativado"} · Barra contas recém-criadas.`,
        value: "filter",
      }
    );

  const selectContainer = new ContainerBuilder()
    .addTextDisplayComponents(text("### Selecione abaixo"), text("-# Selecione o que deseja configurar."))
    .addActionRowComponents(new ActionRowBuilder().addComponents(select));
  addBackButton(selectContainer, "back_comunidade");

  return [header, new SeparatorBuilder(), summary, selectContainer];
}

// ---------- Boas-vindas / Saídas ----------

const KINDS = {
  welcome: {
    title: "Boas-vindas",
    channelTitle: "Canal de boas-vindas",
    channelHint: "Escolha o canal onde a mensagem de boas-vindas será enviada.",
    placeholder: "Selecione o canal de boas-vindas",
    events: [
      "Enviada quando um membro entra no servidor.",
      "Só membros entram aqui, bots não recebem a mensagem.",
    ],
  },
  leave: {
    title: "Saídas",
    channelTitle: "Canal de saídas",
    channelHint: "Escolha o canal onde a mensagem de saída será enviada.",
    placeholder: "Selecione o canal de saídas",
    events: [
      "Enviada quando um membro sai, é expulso ou banido.",
      "Bots não geram mensagem de saída.",
    ],
  },
};

function buildGreetingPanel(guild, config, kind) {
  const info = KINDS[kind];
  const f = FIELDS[kind];
  const channelId = config[f.channel];
  const enabled = config[f.enabled];
  const ready = Boolean(channelId);

  const panel = new ContainerBuilder()
    .addTextDisplayComponents(
      text(
        [
          `### ${info.channelTitle}`,
          `-# ${info.channelHint}`,
          `-# Atual: ${channelId ? `<#${channelId}>` : "`Não definido`"} · Estado: \`${stateOf(enabled, ready)}\``,
        ].join("\n")
      )
    )
    .addActionRowComponents(channelSelect(`port_channel:${kind}`, channelId, guild, info.placeholder))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        button(`port_toggle:${kind}`, enabled ? "Desativar" : "Ativar", {
          style: enabled ? ButtonStyle.Danger : ButtonStyle.Success,
        }),
        button(`port_test:${kind}`, "Enviar teste", { disabled: !ready }),
        button(`port_clear:${kind}`, "Remover canal", { style: ButtonStyle.Danger, disabled: !ready })
      )
    );

  const options = new ContainerBuilder()
    .addTextDisplayComponents(
      text(`### Aparência da mensagem\n-# Edite tudo o que aparece. Use "Enviar teste" para ver o resultado.\n${appearanceSummary(kind, config)}`)
    )
    .addActionRowComponents(...appearanceRows(kind, config, { withDelay: true }));

  const events = new ContainerBuilder().addTextDisplayComponents(
    text("### Como funciona"),
    text(
      [
        ...info.events.map((line) => `• ${line}`),
        "• Sem cor por padrão: escolha uma em \"Cor\" se quiser.",
        "• Formato Container permite miniatura, imagens e separadores. Formato Texto é uma mensagem comum.",
      ].join("\n")
    )
  );
  addBackButton(events, "port_back");

  return [tabHeader(info.title, info.title), panel, options, variablesContainer(), events];
}

// ---------- DM de boas-vindas ----------

function buildDmPanel(guild, config) {
  const enabled = config.dmEnabled;

  const panel = new ContainerBuilder()
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          text("### DM de boas-vindas"),
          text("-# Mensagem privada enviada para quem acabou de entrar."),
          text(`-# Estado: \`${stateOf(enabled)}\``)
        )
        .setButtonAccessory(
          button("port_toggle:dm", enabled ? "Desativar" : "Ativar", {
            style: enabled ? ButtonStyle.Danger : ButtonStyle.Success,
          })
        )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      text(`**Aparência da mensagem**\n-# Edite tudo o que aparece na DM.\n${appearanceSummary("dm", config)}`)
    )
    .addActionRowComponents(...appearanceRows("dm", config))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(button("port_test:dm", "Enviar teste para mim"))
    );

  const notes = new ContainerBuilder().addTextDisplayComponents(
    text("### Antes de ativar"),
    text(
      [
        "• Membros com a DM fechada para o servidor não recebem a mensagem, e isso não gera erro.",
        "• O rodapé padrão informa de qual servidor a DM veio. Se você mudar o rodapé, lembre de manter essa informação.",
        "• Bots não recebem DM.",
      ].join("\n")
    )
  );

  const vars = variablesContainer();
  addBackButton(vars, "port_back");

  return [tabHeader("DM de boas-vindas", "DM de boas-vindas"), panel, notes, vars];
}

// ---------- Cargos de bots ----------

function buildBotRolesPanel(guild, config) {
  const roles = config.botAutoRoles.filter((id) => guild.roles.cache.has(id));

  const select = new RoleSelectMenuBuilder()
    .setCustomId("port_botroles")
    .setPlaceholder("Selecione até 5 cargos")
    .setMinValues(0)
    .setMaxValues(5);
  if (roles.length) select.setDefaultRoles(roles);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text("### Cargos de bots"),
      text("-# Cargos entregues automaticamente só para bots que entram no servidor."),
      text(`-# Atuais: ${roles.length ? roles.map((r) => `<@&${r}>`).join(", ") : "`Nenhum`"}`)
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(select))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      text("-# Os cargos de membros continuam em Auto-roles. O cargo do bot precisa estar acima dos escolhidos.")
    );
  addBackButton(container, "port_back");

  return [tabHeader("Cargos de bots", "Cargos de bots"), container];
}

// ---------- Filtro de contas novas ----------

function buildFilterPanel(guild, config) {
  const enabled = config.accountFilterEnabled;

  const panel = new ContainerBuilder()
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          text("### Filtro de contas novas"),
          text("-# Expulsa quem entra com a conta criada há menos tempo que o mínimo."),
          text(`-# Estado: \`${stateOf(enabled)}\` · Mínimo: \`${config.accountMinAgeDays} dia(s)\``)
        )
        .setButtonAccessory(
          button("port_toggle:filter", enabled ? "Desativar" : "Ativar", {
            style: enabled ? ButtonStyle.Danger : ButtonStyle.Success,
          })
        )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(button("port_age", "Definir idade mínima"))
    );

  const notes = new ContainerBuilder().addTextDisplayComponents(
    text("### Como funciona"),
    text(
      [
        "• O membro recebe uma DM explicando o motivo e depois é expulso.",
        "• Ele pode entrar de novo quando a conta atingir a idade mínima.",
        "• Ajuda contra contas descartáveis e raids.",
        "• O bot precisa da permissão Expulsar Membros e de um cargo acima dos membros.",
      ].join("\n")
    )
  );
  addBackButton(notes, "port_back");

  return [tabHeader("Filtro de contas novas", "Filtro de contas novas"), panel, notes];
}

module.exports = {
  buildPortariaPanel,
  buildGreetingPanel,
  buildDmPanel,
  buildBotRolesPanel,
  buildFilterPanel,
};
