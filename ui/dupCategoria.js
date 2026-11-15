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
  RoleSelectMenuBuilder,
  ChannelType,
} = require("discord.js");
const { textLabel, modal } = require("./modalHelpers");
const {
  TYPE_INFO,
  categoryChildren,
  plannedChannels,
  newChannelName,
  passesFilter,
  copyName,
  describeCategory,
} = require("../utils/catClone/clone");

const CHECK = "<:check:1571598243526348850>";

const CH_PAGE_SIZE = 25;
const MAX_ACCESS_ROLES = 10;

const text = (content) => new TextDisplayBuilder().setContent(String(content || "-").slice(0, 3800));
const sep = () => new SeparatorBuilder();
const row = (...components) => new ActionRowBuilder().addComponents(...components);
const clip = (value, max) => String(value ?? "").slice(0, max);
const id = (state, action) => `dup:${state.sid}:${action}`;
const yesNo = (value) => (value ? "Sim" : "Não");

function btn(state, action, label, style = ButtonStyle.Secondary, disabled = false) {
  return new ButtonBuilder().setCustomId(id(state, action)).setLabel(label).setStyle(style).setDisabled(disabled);
}

// Tipos de canal que podem ser copiados (select "Tipos de canal")
const TYPE_OPTIONS = [
  { key: "text", label: "Canais de texto", description: "Canais de conversa por mensagens" },
  { key: "announcement", label: "Canais de anúncios", description: "Canais de avisos que podem ser seguidos" },
  { key: "voice", label: "Canais de voz", description: "Canais de conversa por voz" },
  { key: "stage", label: "Canais de palco", description: "Canais de palco para eventos e palestras" },
  { key: "forum", label: "Fóruns", description: "Canais de fórum com posts" },
  { key: "media", label: "Canais de mídia", description: "Canais de galeria de mídia" },
];

// Itens que podem ser levados junto (select "O que copiar")
const ITEM_OPTIONS = [
  { key: "catPerms", label: "Permissões da categoria", description: "Cargos e membros com permissão própria na categoria" },
  { key: "chanPerms", label: "Permissões de cada canal", description: "Desligado: os canais herdam as da nova categoria" },
  { key: "topic", label: "Tópicos e descrições", description: "Tópico de canais de texto, anúncios, fóruns e mídia" },
  { key: "slowmode", label: "Modo lento", description: "Intervalo entre mensagens de cada canal" },
  { key: "nsfw", label: "Restrição de idade (+18)", description: "Canais marcados como +18 continuam marcados" },
  { key: "voiceQuality", label: "Voz: qualidade", description: "Taxa de bits e qualidade de vídeo dos canais de voz e palco" },
  { key: "voiceLimit", label: "Voz: limite de pessoas", description: "Máximo de pessoas em cada canal de voz" },
  { key: "voiceRegion", label: "Voz: região", description: "Região de voz fixa dos canais de voz e palco" },
  { key: "forumTags", label: "Fóruns e mídia: tags", description: "Tags disponíveis para os posts, com emoji e moderação" },
  { key: "forumDefaults", label: "Fóruns e mídia: padrões", description: "Emoji de reação, ordenação e layout padrão" },
  { key: "forumFlags", label: "Fóruns e mídia: regras", description: "Exigir tag nos posts e esconder opções de download" },
  { key: "threadArchive", label: "Threads: arquivamento", description: "Tempo padrão para arquivar threads sem uso" },
  { key: "threadSlowmode", label: "Threads: modo lento", description: "Modo lento padrão das threads criadas nos canais" },
];

const POSITION_OPTIONS = [
  { value: "below", label: "Logo abaixo da original", description: "A cópia aparece colada embaixo da categoria original" },
  { value: "above", label: "Logo acima da original", description: "A cópia aparece colada em cima da categoria original" },
  { value: "top", label: "No topo da lista de canais", description: "A cópia vira a primeira categoria do servidor" },
  { value: "end", label: "No final da lista de canais", description: "A cópia vira a última categoria do servidor" },
];
const POSITION_LABEL = Object.fromEntries(POSITION_OPTIONS.map((o) => [o.value, o.label.toLowerCase()]));

const ORDER_OPTIONS = [
  { value: "original", label: "Ordem original", description: "Os canais ficam na mesma ordem da categoria original" },
  { value: "az", label: "Ordem alfabética", description: "Canais de texto e de voz em ordem de A a Z" },
];

const countsLine = (counts) =>
  Object.entries(TYPE_INFO)
    .filter(([type]) => counts[type])
    .map(([type, info]) => `${info.label} ${counts[type]}`)
    .join(" · ") || "nenhum canal";

const rolesLine = (roles) => (roles.length ? roles.map((r) => `<@&${r}>`).join(" ") : "nenhum");

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
          .setDescription(o.description)
          .setValue(o.key)
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
          btn(state, "go:access", "Acesso"),
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
  const filters = [
    state.filterInclude ? `só com \`${clip(state.filterInclude, 30)}\`` : null,
    state.filterExclude ? `sem \`${clip(state.filterExclude, 30)}\`` : null,
  ].filter(Boolean);

  container.addTextDisplayComponents(
    text("### Escolher canais"),
    text(
      children.length
        ? `-# Página ${page + 1}/${pages} · Marque os canais que devem ser copiados. Canais de um tipo desligado ou fora do filtro não são copiados mesmo marcados.\n**Filtro por nome:** ${filters.length ? filters.join(", ") : "nenhum"}`
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
          const notes = [];
          if (!state.types.has(info.key)) notes.push("tipo desligado");
          if (!passesFilter(state, channel)) notes.push("fora do filtro");
          return new StringSelectMenuOptionBuilder()
            .setLabel(clip(channel.name, 100))
            .setValue(channel.id)
            .setDescription(clip(`${info.label}${notes.length ? ` (${notes.join(", ")})` : ""} · ${own} permissão(ões) própria(s)`, 100))
            .setDefault(!state.excluded.has(channel.id));
        })
      );
    container.addSeparatorComponents(sep()).addActionRowComponents(row(select));
  }

  container.addActionRowComponents(
    row(
      btn(state, "chprev", "Anterior", ButtonStyle.Secondary, page <= 0),
      btn(state, "chnext", "Próxima", ButtonStyle.Secondary, page >= pages - 1),
      btn(state, "chall", "Marcar todos", ButtonStyle.Secondary, !children.length),
      btn(state, "chnone", "Desmarcar todos", ButtonStyle.Secondary, !children.length),
      btn(state, "filter", "Filtrar por nome", ButtonStyle.Secondary, !children.length)
    )
  );
  container.addActionRowComponents(row(btn(state, "go:options", "Voltar", ButtonStyle.Primary)));
  return [container];
}

function buildFilterModal(state) {
  return modal(
    id(state, "fmodal"),
    "Filtrar canais por nome",
    textLabel({
      id: "include",
      label: "Copiar só canais que contêm",
      description: "Opcional. Ex.: \"evento\" copia só canais com \"evento\" no nome.",
      max: 100,
      value: state.filterInclude,
      placeholder: "Texto que o nome precisa ter",
    }),
    textLabel({
      id: "exclude",
      label: "Nunca copiar canais que contêm",
      description: "Opcional. Ex.: \"staff\" deixa de fora canais com \"staff\" no nome.",
      max: 100,
      value: state.filterExclude,
      placeholder: "Texto que tira o canal da cópia",
    })
  );
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

  const orderSelect = new StringSelectMenuBuilder()
    .setCustomId(id(state, "order"))
    .setPlaceholder("Ordem dos canais na cópia")
    .addOptions(
      ORDER_OPTIONS.map((o) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(o.label)
          .setDescription(o.description)
          .setValue(o.value)
          .setDefault(state.order === o.value)
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

  const swap = state.find ? `\`${clip(state.find, 40)}\` por \`${clip(state.replace, 40) || "(nada)"}\`` : "nenhuma";
  return [
    new ContainerBuilder()
      .addTextDisplayComponents(
        text("### Nome e posição"),
        text(
          [
            `**Nome da categoria:** ${copyName(state, 0)}${state.copies > 1 ? " (cada cópia ganha um número)" : ""}`,
            `**Troca de texto nos canais:** ${swap}`,
            `**Prefixo / sufixo nos canais:** ${state.prefix ? `\`${clip(state.prefix, 30)}\`` : "nenhum"} / ${state.suffix ? `\`${clip(state.suffix, 30)}\`` : "nenhum"}`,
            `**Posição:** ${POSITION_LABEL[state.position]} · **Ordem:** ${state.order === "az" ? "alfabética" : "original"} · **Cópias:** ${state.copies}`,
          ].join("\n")
        )
      )
      .addActionRowComponents(row(btn(state, "rename", "Nomes dos canais e da categoria", ButtonStyle.Primary)))
      .addSeparatorComponents(sep())
      .addActionRowComponents(row(positionSelect))
      .addActionRowComponents(row(orderSelect))
      .addActionRowComponents(row(copiesSelect))
      .addActionRowComponents(row(btn(state, "go:options", "Voltar"), btn(state, "go:review", "Revisar", ButtonStyle.Primary))),
  ];
}

function buildRenameModal(state) {
  return modal(
    id(state, "modal"),
    "Nomes da cópia",
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
    }),
    textLabel({
      id: "prefix",
      label: "Prefixo nos nomes dos canais",
      description: "Opcional. Entra antes do nome de cada canal copiado.",
      max: 30,
      value: state.prefix,
      placeholder: "Ex.: novo-",
    }),
    textLabel({
      id: "suffix",
      label: "Sufixo nos nomes dos canais",
      description: "Opcional. Entra depois do nome de cada canal copiado.",
      max: 30,
      value: state.suffix,
      placeholder: "Ex.: -2025",
    })
  );
}

// ---------- Acesso ----------

function buildAccess(state) {
  const select = new RoleSelectMenuBuilder()
    .setCustomId(id(state, "roles"))
    .setPlaceholder("Cargos que terão acesso à cópia")
    .setMinValues(0)
    .setMaxValues(MAX_ACCESS_ROLES);
  if (state.accessRoles.length) select.setDefaultRoles(state.accessRoles);

  return [
    new ContainerBuilder()
      .addTextDisplayComponents(
        text("### Acesso à cópia"),
        text(
          [
            "-# Opcional. Vale para a categoria e para todos os canais copiados, por cima das permissões copiadas.",
            `**Esconder de @everyone:** ${yesNo(state.privateCopy)}`,
            `**Cargos com acesso:** ${rolesLine(state.accessRoles)}`,
            "-# Cargos escolhidos podem ver a categoria e os canais (e entrar nos canais de voz).",
          ].join("\n")
        )
      )
      .addSeparatorComponents(sep())
      .addActionRowComponents(row(select))
      .addActionRowComponents(
        row(
          btn(state, "priv", `Esconder de @everyone: ${yesNo(state.privateCopy)}`, state.privateCopy ? ButtonStyle.Success : ButtonStyle.Secondary),
          btn(state, "rolesclear", "Limpar cargos", ButtonStyle.Secondary, !state.accessRoles.length)
        )
      )
      .addActionRowComponents(row(btn(state, "go:options", "Voltar"), btn(state, "go:review", "Revisar", ButtonStyle.Primary))),
  ];
}

// ---------- Revisar ----------

function buildReview(state, guild, info) {
  const { source, planned, toCreate, blocking, warnings } = info;
  const container = new ContainerBuilder().addTextDisplayComponents(text("### Revisar e duplicar"));

  if (!source) {
    container.addTextDisplayComponents(text(blocking.join("\n")));
    return [container.addActionRowComponents(row(btn(state, "go:home", "Voltar")))];
  }

  const lines = [copyName(state, 0)];
  const shown = planned.slice(0, 24);
  shown.forEach((channel, i) => {
    const last = i === shown.length - 1 && planned.length === shown.length;
    lines.push(`${last ? "└" : "├"} ${newChannelName(channel, state)}  (${TYPE_INFO[channel.type].label.toLowerCase()})`);
  });
  if (planned.length > shown.length) lines.push(`└ … e mais ${planned.length - shown.length} canal(is)`);
  if (!planned.length) lines.push("└ (nenhum canal; só a categoria)");

  const copied = ITEM_OPTIONS.filter((o) => state.items.has(o.key)).map((o) => o.label.toLowerCase());
  const extras = [];
  if (state.find) extras.push(`troca \`${clip(state.find, 30)}\` por \`${clip(state.replace, 30) || "(nada)"}\``);
  if (state.prefix) extras.push(`prefixo \`${clip(state.prefix, 30)}\``);
  if (state.suffix) extras.push(`sufixo \`${clip(state.suffix, 30)}\``);
  if (state.filterInclude) extras.push(`só canais com \`${clip(state.filterInclude, 30)}\``);
  if (state.filterExclude) extras.push(`sem canais com \`${clip(state.filterExclude, 30)}\``);
  if (state.order === "az") extras.push("ordem alfabética");
  if (state.privateCopy) extras.push("escondida de @everyone");
  if (state.accessRoles.length) extras.push(`acesso para ${rolesLine(state.accessRoles)}`);

  container.addTextDisplayComponents(
    text(
      [
        `**Original:** ${source.name}`,
        `**Posição:** ${POSITION_LABEL[state.position]} · **Cópias:** ${state.copies}`,
        `**Vai criar:** ${toCreate} canal(is) no total (categorias e canais)`,
        `**Copia junto:** ${copied.length ? copied.join(", ") : "nada além dos nomes"}`,
        `**Ajustes:** ${extras.length ? extras.join(" · ") : "nenhum"}`,
        "-# Mensagens, threads, convites e webhooks não são copiados.",
      ].join("\n")
    ),
    text(`\`\`\`\n${lines.join("\n")}\n\`\`\``)
  );

  if (blocking.length) container.addTextDisplayComponents(text(blocking.map((b) => `**Bloqueado:** ${b}`).join("\n")));
  if (warnings.length) container.addTextDisplayComponents(text(warnings.map((w) => `**Atenção:** ${w}`).join("\n")));

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
  const bar = `\`[${"#".repeat(filled)}${"-".repeat(size - filled)}]\``;
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
    ...result.created.map((entry) => `<#${entry.category.id}> · ${entry.channels.length} canal(is)`),
    "",
    `**Criados:** ${result.created.length} categoria(s) e ${channelsCreated} canal(is).`,
  ];

  const container = new ContainerBuilder().addTextDisplayComponents(
    text(result.failures.length ? "### Categoria duplicada com avisos" : `### ${CHECK} Categoria duplicada`),
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
  MAX_ACCESS_ROLES,
  pageChannels,
  channelPages,
  buildHome,
  buildOptions,
  buildChannels,
  buildFilterModal,
  buildNaming,
  buildRenameModal,
  buildAccess,
  buildReview,
  buildProgress,
  buildDone,
  buildUndoConfirm,
  buildUndone,
  buildError,
  buildNotice,
};
