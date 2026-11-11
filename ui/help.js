const {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require("discord.js");
const { permissionNames } = require("../utils/helpRegistry");

const PAGE_SIZE = 6; // comandos por página
const SELECT_LIMIT = 25; // máximo de opções de um select do Discord
const BODY_LIMIT = 3000; // o Discord limita o texto de uma mensagem V2 a 4000 caracteres

const text = (content) => new TextDisplayBuilder().setContent(String(content).slice(0, 3500));
const code = (value) => `\`${String(value ?? "—").replaceAll("`", "'")}\``;
const cut = (value, max) => {
  const s = String(value ?? "");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

// "/ban · prefixo" (slash + prefixo) · "/unban_all" (só slash) · "n!menu" (só prefixo)
function displayName(entry, prefix) {
  if (entry.hasSlash) return `/${entry.slashName}`;
  return `${prefix}${entry.prefixName}`;
}

function rowTitle(entry, prefix) {
  return `**${displayName(entry, prefix)}**${entry.hasSlash && entry.hasPrefix ? " · prefixo" : ""}`;
}

function optionLine(option) {
  const req = option.required ? "obrigatório" : "opcional";
  return `- ${code(option.name)} · ${option.type} · ${req}${option.description ? ` — ${option.description}` : ""}`;
}

function detailText(entry, prefix) {
  const lines = [`### ${rowTitle(entry, prefix)}`, entry.description, "", `**Categoria:** ${entry.category}`];

  if (entry.hasSlash) {
    const args = entry.options.map((o) => (o.required ? `<${o.name}>` : `[${o.name}]`));
    const sub = entry.subs.length ? ["<subcomando>"] : [];
    lines.push(`**Slash:** ${code(`/${[entry.slashName, ...args, ...sub].join(" ")}`)}`);
  }
  if (entry.hasPrefix) {
    lines.push(`**Prefixo:** ${code(prefix + entry.usage)}`);
    if (entry.aliases.length) lines.push(`**Apelidos:** ${entry.aliases.map((a) => code(prefix + a)).join(" ")}`);
  }

  if (entry.options.length) lines.push("", "**Opções**", ...entry.options.map(optionLine));

  if (entry.subs.length) {
    lines.push("", "**Subcomandos**");
    for (const sub of entry.subs) {
      const args = sub.options.map((o) => (o.required ? `<${o.name}>` : `[${o.name}]`)).join(" ");
      lines.push(`- ${code(`/${entry.slashName} ${sub.path}${args ? ` ${args}` : ""}`)} — ${sub.description}`);
    }
  }

  const perms = permissionNames(entry.permission);
  if (perms.length) lines.push("", `**Permissão necessária:** ${perms.join(", ")}`);
  if (entry.staffOnly) lines.push(...(perms.length ? [] : [""]), "**Acesso:** apenas a equipe do servidor");
  return cut(lines.join("\n"), BODY_LIMIT);
}

// cat: "all" ou o slug de uma categoria  ·  selected: key do comando aberto em "Detalhes" (ou null)
function buildHelpPanel({ prefix, commands, categories, cat = "all", page = 0, selected = null }) {
  const activeCat = categories.some((c) => c.slug === cat) ? cat : "all";
  const filtered = activeCat === "all" ? commands : commands.filter((c) => c.categorySlug === activeCat);
  const categoryName = categories.find((c) => c.slug === activeCat)?.name ?? null;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(Math.max(0, Number(page) || 0), totalPages - 1);
  const items = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const detail = selected ? (filtered.find((c) => c.key === selected) ?? null) : null;

  const container = new ContainerBuilder();

  // ---- MENUS (dropdowns) NO TOPO, dentro da embed ----
  const categorySelect = new StringSelectMenuBuilder()
    .setCustomId("help:cat")
    .setPlaceholder("Filtrar por categoria...")
    .addOptions(
      { label: "Todas", description: `${commands.length} comando(s)`, value: "all", default: activeCat === "all" },
      ...categories.slice(0, SELECT_LIMIT - 1).map((c) => ({
        label: cut(c.name, 100),
        description: `${c.count} comando(s)`,
        value: c.slug,
        default: activeCat === c.slug,
      }))
    );

  // "Ir direto a um comando...": janela de até 25 comandos que acompanha a página atual
  const windowStart = Math.max(0, Math.min(current * PAGE_SIZE, filtered.length - SELECT_LIMIT));
  const jumpList = filtered.slice(windowStart, windowStart + SELECT_LIMIT);
  const jumpSelect = new StringSelectMenuBuilder().setCustomId(`help:cmd:${activeCat}:${current}`);
  if (jumpList.length) {
    jumpSelect.setPlaceholder("Ir direto a um comando...").addOptions(
      jumpList.map((entry) => ({
        label: cut(displayName(entry, prefix), 100),
        description: cut(entry.description, 100),
        value: entry.key,
        default: detail?.key === entry.key,
      }))
    );
  } else {
    jumpSelect
      .setPlaceholder("Nenhum comando disponível")
      .setDisabled(true)
      .addOptions({ label: "Nenhum comando", value: "none" });
  }

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(categorySelect),
    new ActionRowBuilder().addComponents(jumpSelect)
  );
  container.addSeparatorComponents(new SeparatorBuilder());

  // ---- TÍTULO ----
  const crumbs = ["Painel", "Ajuda"];
  if (activeCat !== "all" && categoryName) crumbs.push(categoryName);
  let subtitle;
  if (detail) {
    crumbs.push(displayName(detail, prefix));
    subtitle = crumbs.join(" › ");
  } else {
    subtitle = `${crumbs.join(" › ")} · pág. ${current + 1}/${totalPages}`;
  }
  container.addTextDisplayComponents(text(`### Comandos\n-# ${subtitle}`));
  container.addSeparatorComponents(new SeparatorBuilder());

  // ---- CONTEÚDO ----
  if (detail) {
    container.addTextDisplayComponents(text(detailText(detail, prefix)));
  } else if (!items.length) {
    container.addTextDisplayComponents(text("-# Não há comandos disponíveis para você nesta categoria."));
  } else {
    for (const entry of items) {
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(text(`${rowTitle(entry, prefix)}\n-# ${cut(entry.description, 120)}`))
          .setButtonAccessory(
            new ButtonBuilder()
              .setCustomId(`help:det:${activeCat}:${current}:${entry.key}`)
              .setLabel("Detalhes")
              .setStyle(ButtonStyle.Secondary)
          )
      );
    }
  }

  // ---- BOTÕES EMBAIXO, dentro da embed ----
  container.addSeparatorComponents(new SeparatorBuilder());
  const refresh = new ButtonBuilder()
    .setCustomId(`help:nav:${activeCat}:${current}`)
    .setEmoji("🔄")
    .setStyle(ButtonStyle.Secondary);

  const buttons = detail
    ? [
        new ButtonBuilder()
          .setCustomId(`help:nav:${activeCat}:${current}`)
          .setLabel("Voltar")
          .setEmoji("⬅️")
          .setStyle(ButtonStyle.Secondary),
        refresh,
      ]
    : [
        new ButtonBuilder()
          .setCustomId(`help:nav:${activeCat}:${current - 1}`)
          .setEmoji("⬅️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(current <= 0),
        new ButtonBuilder()
          .setCustomId("help:noop")
          .setLabel(`${current + 1}/${totalPages}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`help:nav:${activeCat}:${current + 1}`)
          .setEmoji("➡️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(current >= totalPages - 1),
        refresh,
      ];
  container.addActionRowComponents(new ActionRowBuilder().addComponents(...buttons));

  return [container];
}

module.exports = { buildHelpPanel, PAGE_SIZE };
