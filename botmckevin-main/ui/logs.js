const {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ActionRowBuilder,
} = require("discord.js");
const { addBackButton } = require("./backButton");
const { LOG_CATEGORIES, LOG_KEYS } = require("../utils/logs/categories");
const { COLORS } = require("../utils/logs/format");

const text = (content) => new TextDisplayBuilder().setContent(content);

function button(customId, label, { style = ButtonStyle.Secondary, disabled = false } = {}) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style).setDisabled(disabled);
}

function stateOf(cfg) {
  if (!cfg.channelId) return "Sem canal";
  return cfg.enabled ? "Ativo" : "Desativado";
}

// Verde = funcionando, vermelho = desativado, sem cor = ainda sem canal
function colorOf(cfg) {
  if (!cfg.channelId) return COLORS.white;
  return cfg.enabled ? COLORS.green : COLORS.red;
}

function tabHeader(title, tabName) {
  return new ContainerBuilder().addTextDisplayComponents(
    text(`## ${title}`),
    text(`-# Você está na aba de configurações de **${tabName}** do bot.`)
  );
}

function channelSelect(customId, cfg, guild, placeholder) {
  const select = new ChannelSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1);
  if (cfg?.channelId && guild.channels.cache.has(cfg.channelId)) {
    select.setDefaultChannels(cfg.channelId);
  }
  return new ActionRowBuilder().addComponents(select);
}

// ---------- Painel principal de logs ----------

function buildLogsPanel(guild, all) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("## Logs e registros"),
    text("-# Defina para onde vão os registros de mensagens, moderação, calls, canais e mais.")
  );

  const summary = new ContainerBuilder()
    .addTextDisplayComponents(
      text("**Situação atual**"),
      text(
        LOG_KEYS.map((key) => {
          const cfg = all[key];
          const where = cfg.channelId ? `<#${cfg.channelId}>` : "`Não definido`";
          return `**${LOG_CATEGORIES[key].label}:** ${where} · ${stateOf(cfg)}`;
        }).join("\n")
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          text("**Canal único**"),
          text("-# Envie todos os logs para o mesmo canal.")
        )
        .setButtonAccessory(button("logs_all", "Definir"))
    );

  const select = new StringSelectMenuBuilder()
    .setCustomId("logs_menu")
    .setPlaceholder("Selecione uma opção")
    .addOptions(
      LOG_KEYS.map((key) => {
        const cfg = all[key];
        const channel = cfg.channelId ? guild.channels.cache.get(cfg.channelId) : null;
        const detail = channel ? `${stateOf(cfg)} em #${channel.name}` : stateOf(cfg);
        return {
          label: LOG_CATEGORIES[key].option,
          description: `${detail} · ${LOG_CATEGORIES[key].description}`.slice(0, 100),
          value: key,
        };
      })
    );

  const selectContainer = new ContainerBuilder()
    .addTextDisplayComponents(
      text("### Selecione abaixo"),
      text("-# Selecione o que deseja configurar.")
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(select));
  addBackButton(selectContainer, "back_moderacao");

  return [header, new SeparatorBuilder(), summary, selectContainer];
}

// ---------- Uma categoria ----------

function buildLogCategoryPanel(guild, key, cfg) {
  const info = LOG_CATEGORIES[key];

  const config = new ContainerBuilder()
    .setAccentColor(colorOf(cfg))
    .addTextDisplayComponents(
      text("### Canal de logs"),
      text("-# Escolha o canal onde os registros serão enviados."),
      text(
        `-# Atual: ${cfg.channelId ? `<#${cfg.channelId}>` : "`Não definido`"} · Estado: \`${stateOf(cfg)}\``
      )
    )
    .addActionRowComponents(channelSelect(`logs_channel:${key}`, cfg, guild, "Selecione o canal"))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        button(`logs_toggle:${key}`, cfg.enabled ? "Desativar" : "Ativar", {
          style: cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success,
        }),
        button(`logs_bots:${key}`, `Ignorar bots: ${cfg.ignoreBots ? "Sim" : "Não"}`),
        button(`logs_test:${key}`, "Enviar teste", { disabled: !cfg.channelId }),
        button(`logs_clear:${key}`, "Remover canal", {
          style: ButtonStyle.Danger,
          disabled: !cfg.channelId,
        })
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(button(`logs_create:${key}`, "Criar canal automaticamente"))
    );

  const events = new ContainerBuilder()
    .addTextDisplayComponents(
      text("### O que é registrado"),
      text(info.events.map((line) => `• ${line}`).join("\n")),
      text(`-# Ignorar bots: ${info.botsHint}`)
    );
  addBackButton(events, "logs_back");

  return [tabHeader(info.label, info.label), config, events];
}

// ---------- Canal único para todos os logs ----------

function buildLogsAllPanel(guild) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text("### Canal único"),
      text("-# Todas as categorias passam a enviar os logs para o canal escolhido e ficam ativas.")
    )
    .addActionRowComponents(channelSelect("logs_all_channel", null, guild, "Selecione o canal"));
  addBackButton(container, "logs_back");

  return [tabHeader("Canal único", "Canal único"), container];
}

module.exports = { buildLogsPanel, buildLogCategoryPanel, buildLogsAllPanel };
