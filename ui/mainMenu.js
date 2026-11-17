const {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  ThumbnailBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
} = require("discord.js");
const { TIMEOUT_MS } = require("../utils/menuSession");

const text = (content) => new TextDisplayBuilder().setContent(String(content).slice(0, 3500));
const code = (value) => `\`${String(value ?? "—").replaceAll("`", "'")}\``;
const unix = (ms) => Math.floor(ms / 1000);

// Lista única de sistemas: alimenta o texto do topo e as opções do select.
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

// guild/client/prefix são opcionais: sem eles o menu aparece sem a parte de informações
function buildMainMenu({ guild, client, prefix } = {}) {
  // Miniatura: ícone do servidor -> avatar do bot -> nenhuma (nunca a logo padrão do Discord)
  const icon =
    guild?.iconURL({ extension: "png", size: 256 }) ??
    client?.user?.displayAvatarURL({ extension: "png", size: 256 }) ??
    null;

  const headerLines = [
    "## Menu de configurações",
    guild
      ? `-# Painel de controle do bot em **${guild.name}**. Escolha um sistema abaixo para configurar.`
      : "-# Painel de controle do bot. Escolha um sistema abaixo para configurar.",
    `-# Sistemas disponíveis: ${SISTEMAS.map((s) => s.label).join(" · ")}`,
  ];

  const header = new ContainerBuilder();
  if (icon) {
    header.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(...headerLines.map(text))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(icon))
    );
  } else {
    header.addTextDisplayComponents(...headerLines.map(text));
  }

  const containers = [header];

  if (client?.user) {
    const lines = [
      `**Bot:** ${code(client.user.username)} · **Prefixo:** ${code(prefix ?? "n!")}`,
    ];
    const ping = client.ws?.ping;
    const parts = [];
    if (Number.isFinite(ping) && ping >= 0) parts.push(`**Latência:** ${code(`${Math.round(ping)}ms`)}`);
    if (client.readyTimestamp) parts.push(`**Online desde:** <t:${unix(client.readyTimestamp)}:R>`);
    if (parts.length) lines.push(parts.join(" · "));

    containers.push(
      new ContainerBuilder().addTextDisplayComponents(text("### Sobre o bot"), text(lines.join("\n")))
    );
  }

  containers.push(
    new ContainerBuilder().addTextDisplayComponents(
      text("### Sistemas"),
      text(SISTEMAS.map((s) => `**${s.label}**\n-# ${s.description}`).join("\n"))
    )
  );

  const selectContainer = new ContainerBuilder().addTextDisplayComponents(
    text("### Selecione abaixo"),
    text("-# Selecione o que deseja configurar.")
  );
  selectContainer.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("main_menu")
        .setPlaceholder("Selecione uma opção")
        .addOptions(SISTEMAS)
    )
  );
  selectContainer
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      text(`-# Este menu expira após ${Math.round(TIMEOUT_MS / 60000)} minutos sem interação.`)
    );
  containers.push(selectContainer);

  return containers;
}

// Versão enxuta usada só para o botão "Voltar" (dentro da mensagem efêmera de um sistema).
// Sem o cabeçalho com informações do servidor/bot e sem repetir a lista de sistemas: isso já
// apareceu na mensagem pública do n!menu. Aqui é só o título e o select para escolher de novo.
function buildMainMenuSelect() {
  const header = new ContainerBuilder().addTextDisplayComponents(text("### Menu de configurações"));

  const selectContainer = new ContainerBuilder().addTextDisplayComponents(
    text("**Selecione abaixo**"),
    text("-# Selecione o que deseja configurar.")
  );
  selectContainer.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("main_menu")
        .setPlaceholder("Selecione uma opção")
        .addOptions(SISTEMAS)
    )
  );

  return [header, selectContainer];
}

module.exports = { buildMainMenu, buildMainMenuSelect, SISTEMAS };
