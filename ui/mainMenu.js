const {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { crumbLine } = require("./breadcrumb");

const MENU_EMOJI = "<:menu:1572384509259685899>";
const SEARCH_EMOJI = { name: "search", id: "1569386560107970755" };

const text = (content) => new TextDisplayBuilder().setContent(String(content).slice(0, 3500));
const code = (value) => `\`${String(value ?? "—").replaceAll("`", "'")}\``;
const unix = (ms) => Math.floor(ms / 1000);

// Lista única de sistemas: alimenta as opções do select e a busca do menu.
// Para adicionar um sistema novo, basta incluir aqui (e tratar o value em handlers/selectHandlers.js).
const SISTEMAS = [
  {
    label: "Aparência e prefixo",
    description: "Avatar, banner, prefixo, nome e status do bot.",
    value: "aparencia",
  },
  {
    label: "Comunidade e interação",
    description: "Configurações da comunidade e interações.",
    value: "comunidade",
  },
  {
    label: "Moderação",
    description: "Sistema de tickets e outras ferramentas de moderação.",
    value: "moderacao",
  },
];

// Botão "Buscar" (fica FORA do container). Abre o modal de busca de sistemas.
function buildSearchButton() {
  return new ButtonBuilder()
    .setCustomId("menu_search")
    .setLabel("Buscar")
    .setEmoji(SEARCH_EMOJI)
    .setStyle(ButtonStyle.Secondary);
}

function buildSearchButtonRow() {
  return new ActionRowBuilder().addComponents(buildSearchButton());
}

// Painel principal (aberto pelo /menu): um único container compacto + botão Buscar abaixo.
// guild/client/prefix são opcionais: sem eles o menu aparece sem a parte de informações.
function buildMainMenu({ guild, client, prefix } = {}) {
  // Miniatura: ícone do servidor -> avatar do bot -> nenhuma (nunca a logo padrão do Discord)
  const icon =
    guild?.iconURL({ extension: "png", size: 256 }) ??
    client?.user?.displayAvatarURL({ extension: "png", size: 256 }) ??
    null;

  const lines = [
    `## ${MENU_EMOJI} Menu de configurações\n${crumbLine([])}`,
    guild
      ? `-# Painel de controle do bot em **${guild.name}**.`
      : "-# Painel de controle do bot.",
  ];

  if (client?.user) {
    const info = [`**Bot:** ${code(client.user.username)} · **Prefixo:** ${code(prefix ?? "n!")}`];
    const ping = client.ws?.ping;
    if (Number.isFinite(ping) && ping >= 0) info.push(`**Latência:** ${code(`${Math.round(ping)}ms`)}`);
    if (client.readyTimestamp) info.push(`**Online desde:** <t:${unix(client.readyTimestamp)}:R>`);
    lines.push(`-# ${info.join(" · ")}`);
  }

  const container = new ContainerBuilder();
  if (icon) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(...lines.map(text))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(icon))
    );
  } else {
    container.addTextDisplayComponents(...lines.map(text));
  }

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("main_menu")
        .setPlaceholder("Selecione o que deseja configurar")
        .addOptions(SISTEMAS)
    )
  );

  return [container, buildSearchButtonRow()];
}

module.exports = { buildMainMenu, buildSearchButton, buildSearchButtonRow, SISTEMAS, MENU_EMOJI, SEARCH_EMOJI };
