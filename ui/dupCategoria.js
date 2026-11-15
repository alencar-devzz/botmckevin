const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
} = require("discord.js");
const { textLabel, modal } = require("./modalHelpers");
const {
  TYPE_INFO,
  categoryChildren,
  plannedChannels,
  newChannelName,
  copyName,
  describeCategory,
} = require("../utils/catClone/clone");

const CH_PAGE_SIZE = 25;

const text = (content) => new TextDisplayBuilder().setContent(String(content || "-").slice(0, 3800));
const sep = () => new SeparatorBuilder();
const row = (...components) => new ActionRowBuilder().addComponents(...components);
const clip = (value, max) => String(value ?? "").slice(0, max);
const id = (state, action) => `dup:${state.sid}:${action}`;

function btn(state, action, label, style = ButtonStyle.Secondary, disabled = false) {
  return new ButtonBuilder().setCustomId(id(state, action)).setLabel(label).setStyle(style).setDisabled(disabled);
}

// Tipos de canal que podem ser copiados (select "Tipos de canal")
const TYPE_OPTIONS = [
  { key: "text", label: "Canais de texto", emoji: "💬" },
  { key: "announcement", label: "Canais de anúncios", emoji: "📢" },
  { key: "voice", label: "Canais de voz", emoji: "🔊" },
  { key: "stage", label: "Canais de palco", emoji: "🎙️" },
  { key: "forum", label: "Fóruns", emoji: "🗂️" },
  { key: "media", label: "Canais de mídia", emoji: "🖼️" },
];

// Itens que podem ser levados junto (select "O que copiar")
const ITEM_OPTIONS = [
  { key: "catPerms", label: "Permissões da categoria", description: "Cargos e membros com permissão própria na categoria" },
  { key: "chanPerms", label: "Permissões de cada canal", description: "Permissões de cargos e membros dentro de cada canal" },
  { key: "topic", label: "Tópicos e descrições", description: "Tópico de canais de texto, anúncios, fóruns e mídia" },
  { key: "slowmode", label: "Modo lento", description: "Intervalo entre mensagens de cada canal" },
  { key: "nsfw", label: "Restrição de idade (+18)", description: "Canais marcados como +18 continuam marcados" },
  { key: "voiceCfg", label: "Configurações de voz", description: "Taxa de bits, limite de pessoas, região e qualidade de vídeo" },
  { key: "forumCfg", label: "Configurações de fórum e mídia", description: "Tags, emoji de reação, ordenação, layout e exigir tag" },
  { key: "threadCfg", label: "Configurações de tópicos (threads)", description: "Arquivamento automático e modo lento padrão" },
];

const POSITION_OPTIONS = [
  { value: "below", label: "Logo abaixo da original", description: "A cópia aparece colada embaixo da categoria original" },
  { value: "above", label: "Logo acima da original", description: "A cópia aparece colada em cima da categoria original" },
  { value: "top", label: "No topo da lista de canais", description: "A cópia vira a primeira categoria do servidor" },
  { value: "end", label: "No final da lista de canais", description: "A cópia vira a última categoria do servidor" },
];
const POSITION_LABEL = Object.fromEntries(POSITION_OPTIONS.map((o) => [o.value, o.label.toLowerCase()]));

const countsLine = (counts) =>
  Object.entries(TYPE_INFO)
    .filter(([type]) => counts[type])
    .map(([type, info]) => `${info.emoji} ${counts[type]}`)
    .join(" · ") || "nenhum canal";

// ---------- Início: escolher a categoria ----------

function buildHome(state, guild, notice = null) {
  const source = state.sourceId ? guild.channels.cache.get(state.sourceId) : null;

  const select = new ChannelSelectMenuBuilder()
    .setCustomId(id(state, "cat"))
    .setChannelTypes(ChannelType.GuildCategory)
    .setPlaceholder("Escolha a categoria que será duplicada")
    .setMinValues(1)
    .setMaxValues(1);
  if (source) select.setDefaultChannels([source.id]);

  const container = new ContainerBuilder().addTextDisplayComponents(
    text("### Duplicar categoria"),
    text(
      "-# Copia uma categoria com os canais, todas as permissões e as configurações. Escolha a categoria, ajuste o que levar junto e confirme."
    )
  );
  if (notice) container.addTextDisplayComponents(text(notice));
  container.addSeparatorComponents(sep()).addActionRowComponents(row(select));

  if (source) {
    const info = describeCategory(source);
    container.addTextDisplayComponents(
      text(
        [
          `**Categoria escolhida:** ${source.name}`,
          `**Canais:** ${info.total} (${countsLine(info.counts)})`,
          `**Permissões da categoria:** ${info.categoryOverwrites} regra(s) de cargos e membros`,
          `**Canais com permissões próprias:** ${info.channelsWithOwnPerms} de ${info.total}`,
        ].join("\n")
      )
    );
  }

  container.addActionRowComponents(
    row(btn(state, "go:options", "Continuar", ButtonStyle.Primary, !source), btn(state, "close", "Cancelar"))
  );
  return [container];
}

// ---------- Opções ----------

function buildOptions(state, guild) {
  const source = guild.channels.cache.get(state.sourceId);
  const planned = source ? plannedChannels(state, source) : [];
  const total = source ? categoryChildren(source).length : 0;

  const typeSelect = new StringSelectMenuBuilder()
    .setCustomId(id(state, "types"))
    .setPlaceholder("Tipos de canal que serão copiados")
    .setMinValues(1)
    .setMaxValues(TYPE_OPTIONS.length)
    .addOptions(
      TYPE_OPTIONS.map((o) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(o.label)
          .setValue(o.key)
          .setEmoji(o.emoji)
          .setDefault(state.types.has(o.key))
      )
    );

  const itemSelect = new StringSelectMenuBuilder()
    .setCustomId(id(state, "items"))
    .setPlaceholder("O que copiar junto com os canais")
    .setMinValues(0)
    .setMaxValues(ITEM_OPTIONS.length)
    .addOptions(
      ITEM_OPTIONS.map((o) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(o.label)
          .setDescription(o.description)
          .setValue(o.key)
          .setDefault(state.items.has(o.key))
      )
    );

  return [
    new ContainerBuilder()
      .addTextDisplayComponents(
        text("### Opções de cópia"),
        text(
          [
            `-# Categoria original: **${source?.name ?? "indisponível"}**`,
            `**Canais que serão copiados:** ${planned.length} de ${total}`,
            `**Nome da cópia:** ${copyName(state, 0)}${state.copies > 1 ? ` (${state.copies} cópias)` : ""}`,
          ].join("\n")
        )
      )
      .addSeparatorComponents(sep())
      .addActionRowComponents(row(typeSelect))
      .addActionRowComponents(row(itemSelect))
      .addActionRowComponents(
        row(
          btn(state, "go:channels", "Escolher canais"),
          btn(state, "go:naming", "Nome e posição"),
          btn(state, "go:review", "Revisar", ButtonStyle.Primary)
        )
      )
      .addActionRowComponents(row(btn(state, "go:home", "Voltar"), btn(state, "close", "Cancelar"))),
  ];
}

// ---------- Escolher canais (paginado) ----------

function channelPages(source) {
  return Math.max(1, Math.ceil(categoryChildren(source).length / CH_PAGE_SIZE));
}

function pageChannels(state, source) {
  const children = categoryChildren(source);
  const pages = Math.max(1, Math.ceil(children.length / CH_PAGE_SIZE));
  const page = Math.min(Math.max(state.chPage, 0), pages - 1);
  return { children, pages, page, slice: children.slice(page * CH_PAGE_SIZE, (page + 1) * CH_PAGE_SIZE) };
}

function buildChannels(state, guild) {
  const source = guild.channels.cache.get(state.sourceId);
  const container = new ContainerBuilder();

  if (!source) {
    container.addTextDisplayComponents(text("### Escolher canais"), text("A categoria original não existe mais."));
    return [container.addActionRowComponents(row(btn(state, "go:home", "Voltar")))];
  }

  const { children, pages, page, slice } = pageChannels(state, source);
  container.addTextDisplayComponents(
    text("### Escolher canais"),
    text(
      children.length
        ? `-# Página ${page + 1}/${pages} · Marque os canais que devem ser copiados. Canais de um tipo desligado em "Opções" não são copiados mesmo marcados.`
        : "Essa categoria não tem canais: só a categoria será copiada (com as permissões, se marcado)."
    )
  );

  if (slice.length) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(id(state, "chans"))
      .setPlaceholder("Canais desta página")
      .setMinValues(0)
      .setMaxValues(slice.length)
      .addOptions(
        slice.map((channel) => {
          const info = TYPE_INFO[channel.type];
          const own = channel.permissionOverwrites.cache.size;
          const typeOff = !state.types.has(info.key);
          return new StringSelectMenuOptionBuilder()
            .setLabel(clip(channel.name, 100))
            .setValue(channel.id)
            .setEmoji(info.emoji)
            .setDescription(
              clip(`${info.label}${typeOff ? " (tipo desligado)" : ""} · ${own} permissão(ões) própria(s)`, 100)
            )
            .setDefault(!state.excluded.has(channel.id));
        })
      );
    container.addSeparatorComponents(sep()).addActionRowComponents(row(select));
  }

  container.addActionRowComponents(
    row(
      btn(state, "chprev", "◀ Anterior", ButtonStyle.Secondary, page <= 0),
      btn(state, "chnext", "Próxima ▶", ButtonStyle.Secondary, page >= pages - 1),
      btn(state, "chall", "Marcar todos", ButtonStyle.Secondary, !children.length),
      btn(state, "chnone", "Desmarcar todos", ButtonStyle.Secondary, !children.length)
    )
  );
  container.addActionRowComponents(row(btn(state, "go:options", "Voltar", ButtonStyle.Primary)));
  return [container];
}

// ---------- Nome e posição ----------

function buildNaming(state) {
  const positionSelect = new StringSelectMenuBuilder()
    .setCustomId(id(state, "pos"))
    .setPlaceholder("Onde a cópia vai aparecer")
    .addOptions(
      POSITION_OPTIONS.map((o) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(o.label)
          .setDescription(o.description)
          .setValue(o.value)
          .setDefault(state.position === o.value)
      )
    );

  const copiesSelect = new StringSelectMenuBuilder()
    .setCustomId(id(state, "copies"))
    .setPlaceholder("Quantas cópias criar")
    .addOptions(
      [1, 2, 3, 4, 5].map((n) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(n === 1 ? "1 cópia" : `${n} cópias`)
          .setDescription(n === 1 ? "Uma categoria nova" : "Cada cópia ganha um número no nome")
          .setValue(String(n))
          .setDefault(state.copies === n)
      )
    );

  const find = state.find ? `\`${clip(state.find, 40)}\` → \`${clip(state.replace, 40) || "(apagar)"}\`` : "nenhuma";
  return [
    new ContainerBuilder()
      .addTextDisplayComponents(
        text("### Nome e posição"),
        text(
          [
            `**Nome da categoria:** ${copyName(state, 0)}${state.copies > 1 ? " (cada cópia ganha um número)" : ""}`,
            `**Trocar texto nos nomes dos canais:** ${find}`,
            `**Posição:** ${POSITION_LABEL[state.position]}`,
            `**Cópias:** ${state.copies}`,
          ].join("\n")
        )
      )
      .addActionRowComponents(row(btn(state, "rename", "Renomear / trocar texto", ButtonStyle.Primary)))
      .addSeparatorComponents(sep())
      .addActionRowComponents(row(positionSelect))
      .addActionRowComponents(row(copiesSelect))
      .addActionRowComponents(row(btn(state, "go:options", "Voltar"), btn(state, "go:review", "Revisar", ButtonStyle.Primary))),
  ];
}

function buildRenameModal(state) {
  return modal(
    id(state, "modal"),
    "Nome da cópia",
    textLabel({
      id: "name",
      label: "Nome da nova categoria",
      max: 100,
      required: true,
      value: state.newName ?? "",
      placeholder: "Ex.: Eventos (cópia)",
    }),
    textLabel({
      id: "find",
      label: "Trocar este texto nos nomes dos canais",
      description: "Opcional. Ex.: troque \"2024\" por \"2025\" em todos os canais copiados.",
      max: 100,
      value: state.find,
      placeholder: "Texto a procurar",
    }),
    textLabel({
      id: "replace",
      label: "Por este texto",
      description: "Deixe vazio para apagar o texto procurado.",
      max: 100,
      value: state.replace,
      placeholder: "Texto novo",
    })
  );
}

// ---------- Revisar ----------

function buildReview(state, guild, info) {
  const { source, planned, toCreate, blocking, warnings } = info;
  const container = new ContainerBuilder().addTextDisplayComponents(text("### Revisar e duplicar"));

  if (!source) {
    container.addTextDisplayComponents(text(blocking.join("\n")));
    return [container.addActionRowComponents(row(btn(state, "go:home", "Voltar")))];
  }

  const lines = [`📁 ${copyName(state, 0)}`];
  const shown = planned.slice(0, 24);
  shown.forEach((channel, i) => {
    const last = i === shown.length - 1 && planned.length === shown.length;
    lines.push(`${last ? "└" : "├"} ${TYPE_INFO[channel.type].emoji} ${newChannelName(channel, state)}`);
  });
  if (planned.length > shown.length) lines.push(`└ … e mais ${planned.length - shown.length} canal(is)`);
  if (!planned.length) lines.push("└ (nenhum canal; só a categoria)");

  const copied = ITEM_OPTIONS.filter((o) => state.items.has(o.key)).map((o) => o.label.toLowerCase());
  container.addTextDisplayComponents(
    text(
      [
        `**Original:** ${source.name}`,
        `**Posição:** ${POSITION_LABEL[state.position]} · **Cópias:** ${state.copies}`,
        `**Vai criar:** ${toCreate} canal(is) no total (categorias e canais)`,
        `**Copia junto:** ${copied.length ? copied.join(", ") : "nada além dos nomes"}`,
        "-# Mensagens, threads, convites e webhooks não são copiados.",
      ].join("\n")
    ),
    text(`\`\`\`\n${lines.join("\n")}\n\`\`\``)
  );

  if (blocking.length) container.addTextDisplayComponents(text(blocking.map((b) => `⛔ ${b}`).join("\n")));
  if (warnings.length) container.addTextDisplayComponents(text(warnings.map((w) => `⚠️ ${w}`).join("\n")));

  container.addSeparatorComponents(sep()).addActionRowComponents(
    row(
      btn(state, "clone", "Duplicar categoria", ButtonStyle.Success, blocking.length > 0),
      btn(state, "go:options", "Voltar"),
      btn(state, "close", "Cancelar")
    )
  );
  return [container];
}

// ---------- Progresso, resultado e desfazer ----------

function buildProgress(state, done, total, current) {
  const size = 16;
  const filled = total ? Math.round((done / total) * size) : 0;
  const bar = "▰".repeat(filled) + "▱".repeat(size - filled);
  return [
    new ContainerBuilder().addTextDisplayComponents(
      text("### Duplicando categoria..."),
      text(`${bar}  **${done}/${total}**${current ? `\n-# Criando: ${clip(current, 80)}` : ""}`),
      text("-# Pode levar um tempo: o Discord limita a criação de canais.")
    ),
  ];
}

function buildDone(state) {
  const result = state.result ?? { created: [], failures: [], notes: [] };
  const channelsCreated = result.created.reduce((sum, entry) => sum + entry.channels.length, 0);

  const lines = [
    ...result.created.map((entry) => `📁 <#${entry.category.id}> · ${entry.channels.length} canal(is)`),
    "",
    `**Criados:** ${result.created.length} categoria(s) e ${channelsCreated} canal(is).`,
  ];

  const container = new ContainerBuilder().addTextDisplayComponents(
    text(result.failures.length ? "### Categoria duplicada com avisos" : "### Categoria duplicada"),
    text(lines.join("\n"))
  );

  const problems = [
    ...result.failures.slice(0, 8).map((f) => `• **${clip(f.name, 40)}**: ${clip(f.reason, 120)}`),
    ...(result.failures.length > 8 ? [`• … e mais ${result.failures.length - 8} falha(s)`] : []),
    ...result.notes.map((n) => `• ${n}`),
  ];
  if (problems.length) container.addTextDisplayComponents(text(`**Avisos**\n${problems.join("\n")}`));

  container.addSeparatorComponents(sep()).addActionRowComponents(
    row(
      btn(state, "undo", "Desfazer (apagar cópia)", ButtonStyle.Danger),
      btn(state, "again", "Duplicar outra", ButtonStyle.Primary),
      btn(state, "close", "Fechar")
    )
  );
  return [container];
}

function buildUndoConfirm(state) {
  const result = state.result ?? { created: [] };
  const channels = result.created.reduce((sum, entry) => sum + entry.channels.length, 0);
  return [
    new ContainerBuilder()
      .addTextDisplayComponents(
        text("### Apagar a cópia?"),
        text(
          `Vou apagar as **${result.created.length} categoria(s)** e os **${channels} canal(is)** criados agora. Isso não pode ser desfeito.`
        )
      )
      .addActionRowComponents(row(btn(state, "undoyes", "Apagar cópia", ButtonStyle.Danger), btn(state, "go:done", "Voltar"))),
  ];
}

function buildUndone(state, { deleted, failed }) {
  return [
    new ContainerBuilder()
      .addTextDisplayComponents(
        text("### Cópia apagada"),
        text(`${deleted} canal(is) apagado(s)${failed ? ` · ${failed} não consegui apagar` : ""}.`)
      )
      .addActionRowComponents(row(btn(state, "again", "Duplicar outra", ButtonStyle.Primary), btn(state, "close", "Fechar"))),
  ];
}

function buildError(state, message, backAction = "go:review") {
  return [
    new ContainerBuilder()
      .addTextDisplayComponents(text("### Não deu certo"), text(message))
      .addActionRowComponents(row(btn(state, backAction, "Voltar", ButtonStyle.Primary), btn(state, "close", "Fechar"))),
  ];
}

const buildNotice = (content) => [new ContainerBuilder().addTextDisplayComponents(text(content))];

module.exports = {
  CH_PAGE_SIZE,
  pageChannels,
  channelPages,
  buildHome,
  buildOptions,
  buildChannels,
  buildNaming,
  buildRenameModal,
  buildReview,
  buildProgress,
  buildDone,
  buildUndoConfirm,
  buildUndone,
  buildError,
  buildNotice,
};
