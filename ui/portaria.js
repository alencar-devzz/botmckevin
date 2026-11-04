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
const { COLORS } = require("../utils/logs/format");
const { VARIABLES } = require("../utils/formatMessage");

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

// Verde = funcionando, vermelho = desativado, sem cor = ainda não configurado
function colorOf(enabled, ready) {
  if (!ready) return COLORS.white;
  return enabled ? COLORS.green : COLORS.red;
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
    text("### Variáveis"),
    text("-# Use nas mensagens, elas são trocadas automaticamente."),
    text(VARIABLES.map(([key, desc]) => `\`${key}\` · ${desc}`).join("\n"))
  );
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
    messageTitle: "Mensagem de boas-vindas",
    example: "Ex: Seja bem-vindo(a), {user}!",
    fields: {
      channel: "welcomeChannel",
      message: "welcomeMessage",
      enabled: "welcomeEnabled",
      style: "welcomeStyle",
      delay: "welcomeDeleteAfter",
    },
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
    messageTitle: "Mensagem de saída",
    example: "Ex: {username} saiu do servidor.",
    fields: {
      channel: "leaveChannel",
      message: "leaveMessage",
      enabled: "leaveEnabled",
      style: "leaveStyle",
      delay: "leaveDeleteAfter",
    },
    events: [
      "Enviada quando um membro sai, é expulso ou banido.",
      "Bots não geram mensagem de saída.",
    ],
  },
};

function buildGreetingPanel(guild, config, kind) {
  const info = KINDS[kind];
  const channelId = config[info.fields.channel];
  const enabled = config[info.fields.enabled];
  const message = config[info.fields.message];
  const style = config[info.fields.style];
  const delay = config[info.fields.delay];
  const ready = Boolean(channelId);

  const panel = new ContainerBuilder()
    .setAccentColor(colorOf(enabled, ready))
    .addTextDisplayComponents(
      text(`### ${info.channelTitle}`),
      text(`-# ${info.channelHint}`),
      text(
        `-# Atual: ${channelId ? `<#${channelId}>` : "`Não definido`"} · Estado: \`${stateOf(enabled, ready)}\``
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
      text(`### ${info.messageTitle}`),
      text(`-# Atual: \`${short(message, 120)}\``),
      text("-# Sem mensagem definida, o bot usa um texto padrão.")
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        button(`port_msg:${kind}`, "Editar mensagem"),
        button(`port_style:${kind}`, `Formato: ${style === "container" ? "Container" : "Texto"}`),
        button(`port_delay:${kind}`, `Apagar: ${formatDelay(delay)}`)
      )
    );

  const events = new ContainerBuilder().addTextDisplayComponents(
    text("### Como funciona"),
    text(info.events.map((line) => `• ${line}`).join("\n")),
    text("-# Formato Container mostra a foto do membro ao lado da mensagem.")
  );
  addBackButton(events, "port_back");

  return [tabHeader(info.title, info.title), panel, options, variablesContainer(), events];
}

// ---------- DM de boas-vindas ----------

function buildDmPanel(guild, config) {
  const enabled = config.dmEnabled;

  const panel = new ContainerBuilder()
    .setAccentColor(colorOf(enabled, true))
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
      text("**Mensagem**"),
      text(`-# Atual: \`${short(config.dmMessage, 120)}\``),
      text("-# Sem mensagem definida, o bot usa um texto padrão.")
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        button("port_msg:dm", "Editar mensagem"),
        button("port_test:dm", "Enviar teste para mim")
      )
    );

  const notes = new ContainerBuilder().addTextDisplayComponents(
    text("### Antes de ativar"),
    text(
      [
        "• Membros com a DM fechada para o servidor não recebem a mensagem, e isso não gera erro.",
        "• A DM chega com o nome do servidor no rodapé, então o membro sabe de onde veio.",
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
    .setAccentColor(roles.length ? COLORS.green : COLORS.white)
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
    .setAccentColor(colorOf(enabled, true))
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
