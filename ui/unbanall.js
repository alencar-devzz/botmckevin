const {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  ThumbnailBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");

const HAMMER = "<:hammer:1569386750701215905>";
const MEMBER = "<:member:1570579495746937002>";
const HASHTAG = "<:hashtag:1570940895115616276>";

const PER_PAGE = 25; // limite de opções de um menu
const BAR_WIDTH = 20;
const DEFAULT_AVATAR = "https://cdn.discordapp.com/embed/avatars/0.png";

const text = (content) => new TextDisplayBuilder().setContent(String(content || "-").slice(0, 3800));
const sep = () => new SeparatorBuilder();
const row = (...components) => new ActionRowBuilder().addComponents(...components);
const clip = (value, max) => String(value ?? "").slice(0, max);
const unix = (ms = Date.now()) => Math.floor(ms / 1000);

// Mesmos emojis dos botões de voltar e avançar do /menu
const EMOJI_PREV = { name: "left2", id: "1573414733745365064" };
const EMOJI_NEXT = { name: "right2", id: "1573414717114810448" };

function btn(id, label, style = ButtonStyle.Secondary, disabled = false) {
  return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
}

// Botão só com emoji
function emojiBtn(id, emoji, disabled = false) {
  return new ButtonBuilder().setCustomId(id).setEmoji(emoji).setStyle(ButtonStyle.Secondary).setDisabled(disabled);
}

// Texto à esquerda, botão à direita
function section(lines, button) {
  return new SectionBuilder()
    .addTextDisplayComponents(...lines.map(text))
    .setButtonAccessory(button);
}

const quote = (value) =>
  (String(value ?? "").trim() || "Não inserido")
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// 1m 05s · 2h 03m
function formatSpan(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

// [#######-------------]
function progressBar(done, total) {
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  const filled = Math.round(BAR_WIDTH * ratio);
  return `[${"#".repeat(filled)}${"-".repeat(BAR_WIDTH - filled)}]`;
}

function header(title, subtitle, notice) {
  const container = new ContainerBuilder().addTextDisplayComponents(
    text(`## ${HAMMER} ${title}`),
    text(`-# ${subtitle}`)
  );
  if (notice) container.addTextDisplayComponents(text(`-# ${notice}`));
  return container.addSeparatorComponents(sep());
}

// ---------- Filtro e páginas da lista de banidos ----------

function filteredBans(session) {
  const all = session.bans ?? [];
  const q = session.query.trim().toLowerCase();
  if (!q) return all;
  return all.filter(
    (b) =>
      b.username.toLowerCase().includes(q) ||
      b.globalName?.toLowerCase().includes(q) ||
      b.id.includes(q) ||
      b.reason?.toLowerCase().includes(q)
  );
}

function pageCount(session) {
  return Math.max(1, Math.ceil(filteredBans(session).length / PER_PAGE));
}

// ---------- Início ----------

function homeView(session) {
  const guild = session.guild;
  const total = session.bans?.length ?? null;
  const none = !total;

  const container = header(`Desbanimento · ${guild.name}`, "Painel de banimentos do servidor", session.notice);

  container.addSectionComponents(
    section(
      [
        `**${MEMBER} Desbanir todos**`,
        total === null
          ? "-# Não consegui ler a lista de banidos."
          : `-# ${plural(total, "banido", "banidos")} neste servidor\n-# Desbanimento em massa com confirmação e barra de progresso`,
      ],
      btn("uba:all", "Iniciar", ButtonStyle.Danger, none)
    )
  );

  container.addSeparatorComponents(sep());
  container.addSectionComponents(
    section(
      [
        "**Desbanir individualmente**",
        "-# Escolha um usuário banido num menu e desbana só ele, com confirmação",
      ],
      btn("uba:list", "Ver banidos", ButtonStyle.Secondary, none)
    )
  );

  container.addSeparatorComponents(sep());
  container.addSectionComponents(
    section(
      ["**Banir pessoas**", "-# Adicione várias pessoas pelo ID ou menção e confirme o banimento"],
      btn("uba:add", "Banir", ButtonStyle.Secondary)
    )
  );

  container.addSeparatorComponents(sep()).addTextDisplayComponents(
    text(
      `-# Atualizado <t:${unix(session.bansAt || Date.now())}:R> · Este painel expira <t:${unix(session.expiresAt)}:R> sem uso.`
    )
  );
  container.addActionRowComponents(
    row(
      btn("uba:refresh", "Atualizar"),
      btn("uba:export", "Exportar lista", ButtonStyle.Secondary, none),
      btn("uba:close", "Fechar")
    )
  );

  return [container];
}

// ---------- Lista de banidos (menu para desbanir um) ----------

function listView(session) {
  const guild = session.guild;
  const list = filteredBans(session);
  const pages = pageCount(session);
  const page = Math.min(Math.max(1, session.page), pages);
  const slice = list.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const container = header(
    `Banidos · ${guild.name}`,
    session.query
      ? `${plural(list.length, "resultado", "resultados")} para "${clip(session.query, 40)}"`
      : `${plural(list.length, "banido", "banidos")} · escolha um para desbanir`,
    session.notice
  );

  if (!slice.length) {
    container.addTextDisplayComponents(
      text(session.query ? "Nenhum banido encontrado com essa busca." : "Não há ninguém banido neste servidor.")
    );
  } else {
    container.addTextDisplayComponents(
      text(`-# Mostrando ${(page - 1) * PER_PAGE + 1}–${(page - 1) * PER_PAGE + slice.length} de ${list.length}`)
    );
    container.addActionRowComponents(
      row(
        new StringSelectMenuBuilder()
          .setCustomId("uba:pick")
          .setPlaceholder("Selecione um usuário para desbanir")
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(
            slice.map((b) => ({
              label: clip(
                b.globalName && b.globalName !== b.username ? `${b.globalName} (${b.username})` : b.username,
                100
              ) || b.id,
              description: clip(`${b.id} · ${b.reason ?? "Sem motivo"}`.replace(/\s+/g, " "), 100),
              value: b.id,
            }))
          )
      )
    );
  }

  container.addSeparatorComponents(sep()).addActionRowComponents(
    row(
      emojiBtn("uba:prev", EMOJI_PREV, page <= 1),
      btn("uba:page", `${page}/${pages}`, ButtonStyle.Secondary, true),
      emojiBtn("uba:next", EMOJI_NEXT, page >= pages),
      btn("uba:search", session.query ? "Trocar busca" : "Buscar"),
      btn("uba:home", "Voltar")
    )
  );

  return [container];
}

// ---------- Confirmações ----------

function confirmView(session) {
  const conf = session.confirm;
  const executor = `<@${conf.executorId}> · <t:${unix()}:f>`;
  const guild = session.guild;

  let container;

  if (conf.kind === "all") {
    const estimate = formatSpan(conf.ids.length * 600);
    container = header("Desbanimento em massa", "Deseja realmente desbanir todos os usuários banidos", null);
    container.addTextDisplayComponents(
      text(
        `${MEMBER} **Usuários**\n**${plural(conf.ids.length, "banido", "banidos")}** de **${guild.name}** serão desbanidos\n-# Tempo estimado: cerca de ${estimate}`
      ),
      text(`${HASHTAG} **Motivo**\n${quote(conf.reason)}`),
      text(`**Executor**\n${executor}`)
    );
  } else if (conf.kind === "one") {
    container = header(`Unban · ${conf.tag}`, `Deseja realmente desbanir ${conf.tag}`, null);
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          text(`${MEMBER} **Usuário**\n<@${conf.userId}>\n-# **ID:** ${conf.userId}`)
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(conf.avatar || DEFAULT_AVATAR))
    );
    container.addTextDisplayComponents(
      text(`${HASHTAG} **Motivo**\n${quote(conf.reason)}\n-# Motivo do banimento: ${clip(conf.banReason ?? "Sem motivo", 200)}`),
      text(`**Executor**\n${executor}`)
    );
  } else {
    const shown = conf.users.slice(0, 10).map((u) => `<@${u.id}> · \`${u.username}\``);
    if (conf.users.length > 10) shown.push(`-# e mais ${conf.users.length - 10}...`);
    container = header(
      "Banimento em lote",
      `Deseja realmente banir ${plural(conf.users.length, "usuário", "usuários")}`,
      null
    );
    container.addTextDisplayComponents(
      text(`${MEMBER} **Usuários**\n${shown.join("\n")}`),
      text(`${HASHTAG} **Motivo**\n${quote(conf.reason)}`),
      text(`**Executor**\n${executor}`)
    );
    if (conf.skipped.length) {
      const lines = conf.skipped.slice(0, 5).map((s) => `-# \`${s.id}\`: ${s.why}`);
      if (conf.skipped.length > 5) lines.push(`-# e mais ${conf.skipped.length - 5}...`);
      container.addTextDisplayComponents(text(`**Ignorados (${conf.skipped.length})**\n${lines.join("\n")}`));
    }
  }

  container.addSeparatorComponents(sep()).addActionRowComponents(
    row(btn("uba:yes", "Confirmar", ButtonStyle.Success), btn("uba:no", "Cancelar", ButtonStyle.Danger))
  );
  container.addTextDisplayComponents(text(`-# Esta confirmação expira <t:${unix(conf.expiresAt)}:R>.`));

  return [container];
}

// ---------- Andamento (barra de carregamento) ----------

function progressView(session) {
  const job = session.job;
  const pct = job.total ? Math.floor((job.done / job.total) * 100) : 0;
  const title = job.kind === "all" ? "Desbanimento em massa" : "Banimento em lote";
  const verb = job.kind === "all" ? "Desbanidos" : "Banidos";

  let eta = "calculando...";
  if (job.done >= 3) {
    const perItem = (Date.now() - job.startedAt) / job.done;
    eta = `cerca de ${formatSpan(perItem * (job.total - job.done))}`;
  }

  const container = header(
    title,
    job.cancel ? "Parando, só um instante..." : `Em andamento · iniciado <t:${unix(job.startedAt)}:R>`,
    null
  );
  container.addTextDisplayComponents(
    text(`\`${progressBar(job.done, job.total)}\` **${pct}%**`),
    text(
      [
        `${MEMBER} **Progresso**`,
        `\`${job.done}/${job.total}\` processados`,
        `**${verb}:** \`${job.ok}\` · **Falhas:** \`${job.failed}\`${job.skipped ? ` · **Já estavam desbanidos:** \`${job.skipped}\`` : ""}`,
        `-# Tempo restante: ${eta}`,
      ].join("\n")
    )
  );
  container.addSeparatorComponents(sep()).addActionRowComponents(
    row(btn("uba:stop", "Parar", ButtonStyle.Danger, job.cancel))
  );

  return [container];
}

// ---------- Resultado ----------

function doneView(session) {
  const r = session.result;
  const title =
    r.kind === "all"
      ? r.interrupted || r.aborted
        ? "Desbanimento em massa interrompido"
        : "Desbanimento em massa concluído"
      : r.interrupted || r.aborted
        ? "Banimento em lote interrompido"
        : "Banimento em lote concluído";
  const verb = r.kind === "all" ? "Desbanidos" : "Banidos";
  const stopped = r.interrupted || r.aborted;

  const container = header(title, stopped ? "Ação interrompida antes do fim" : "Ação realizada com sucesso", null);

  const counts = [
    `${MEMBER} **Resultado**`,
    `**${verb}:** \`${r.ok}\` · **Falhas:** \`${r.failed}\`${r.skipped ? ` · **Já estavam desbanidos:** \`${r.skipped}\`` : ""}`,
    `-# Processados ${r.done} de ${r.total} em ${formatSpan(r.finishedAt - r.startedAt)}`,
  ];
  if (r.aborted) counts.push(`-# Motivo da interrupção: ${r.aborted}`);
  container.addTextDisplayComponents(text(counts.join("\n")));

  if (r.failures.length) {
    const lines = r.failures.slice(0, 5).map((f) => `-# \`${f.id}\`: ${f.why}`);
    if (r.failures.length > 5) lines.push(`-# e mais ${r.failures.length - 5}...`);
    container.addTextDisplayComponents(text(`**Falhas**\n${lines.join("\n")}`));
  }

  container.addTextDisplayComponents(
    text(`${HASHTAG} **Motivo**\n${quote(r.reason)}`),
    text(`**Executor**\n<@${r.executorId}> · <t:${unix(r.finishedAt)}:f>`)
  );
  container.addSeparatorComponents(sep()).addActionRowComponents(row(btn("uba:home", "Voltar")));

  return [container];
}

function buildView(session) {
  switch (session.view) {
    case "list":
      return listView(session);
    case "confirm":
      return confirmView(session);
    case "progress":
      return progressView(session);
    case "done":
      return doneView(session);
    default:
      return homeView(session);
  }
}

module.exports = { buildView, PER_PAGE, filteredBans, pageCount, formatSpan };
