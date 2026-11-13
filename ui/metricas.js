const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  ThumbnailBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

// Painel do comando metricas. Components V2, sem cor de destaque e no mesmo estilo do painel do painelps:
// título, containers com "### Seção" e linhas "**Nome**  `valor`", botões numa linha embaixo.
// IDs dos componentes: "met:<ação>"

const text = (content) => new TextDisplayBuilder().setContent(String(content));
const box = () => new ContainerBuilder();
const row = (...components) => new ActionRowBuilder().addComponents(...components);
const tag = (value) => `\`${value}\``;
const unix = (ms) => Math.floor(ms / 1000);

// O Discord limita o texto total de uma mensagem em Components V2 (4000 caracteres)
const TEXT_LIMIT = 3900;

// ---------- Formatação ----------
const num = (n) => Number(n ?? 0).toLocaleString("pt-BR");
const dec = (n, digits = 1) => Number(n).toFixed(digits).replace(".", ",");

function bytes(n) {
  if (n === null || n === undefined) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Number(n);
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${i === 0 ? Math.round(value) : dec(value)} ${units[i]}`;
}

function span(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h ${m}min`;
  if (h) return `${h}h ${m}min`;
  if (m) return `${m}min ${s % 60}s`;
  return `${s}s`;
}

const ms = (n) => (n === null || n === undefined ? "-" : `${n < 10 ? dec(n) : Math.round(n)} ms`);
const percent = (ratio) => `${Math.round(ratio * 100)}%`;

const LEVEL = ["Saudável", "Atenção", "Crítico"];
const level = (n) => tag(LEVEL[n] ?? "Desconhecido");

// Botão que abre o MongoDB. Defina MONGODB_URL na Render com o link do seu cluster para ir direto nele.
function mongoUrl() {
  const custom = (process.env.MONGODB_URL ?? "").trim();
  return /^https?:\/\//i.test(custom) ? custom : "https://cloud.mongodb.com";
}

// ---------- Seções ----------
function healthSection(data) {
  const { levels, notes, overall } = data.health;
  return [
    "### Saúde",
    `**Estado geral**  ${level(overall)}`,
    `**Discord**  ${level(levels.discord)}`,
    `**Banco de dados**  ${level(levels.db)}`,
    `**Memória**  ${level(levels.memory)}`,
    `**Processador**  ${level(levels.cpu)}`,
    `**Event loop**  ${level(levels.loop)}`,
    `-# ${notes.length ? notes.join(" · ") : "Tudo funcionando normalmente."}`,
  ].join("\n");
}

function memorySection(data) {
  const m = data.memory;
  const lines = [
    "### Memória (RAM)",
    m.limit
      ? `**Em uso (RSS)**  ${tag(bytes(m.rss))} de ${tag(bytes(m.limit))} (${percent(m.rss / m.limit)})`
      : `**Em uso (RSS)**  ${tag(bytes(m.rss))}`,
    `**Heap usado**  ${tag(bytes(m.heapUsed))}  ·  **Alocado**  ${tag(bytes(m.heapTotal))}`,
    `**Limite do heap**  ${tag(bytes(m.heapLimit))} (${percent(m.heapUsed / m.heapLimit)} usado)`,
    `**Externa**  ${tag(bytes(m.external))}  ·  **Buffers**  ${tag(bytes(m.arrayBuffers))}`,
    `**Máquina**  ${tag(bytes(m.hostFree))} livres de ${tag(bytes(m.hostTotal))}`,
  ];
  return lines.join("\n");
}

function processSection(data) {
  const p = data.proc;
  const loop = p.loop;
  const lines = [
    "### Processo",
    `**PID**  ${tag(p.pid)}  ·  **Node**  ${tag(p.node)}`,
    `**Sistema**  ${tag(p.platform)}  ·  **Núcleos**  ${tag(p.cores)}`,
    `**Ligado há**  ${tag(span(p.uptime))}`,
    `**CPU do bot**  ${tag(`${dec(p.cpu)}%`)}  ·  **Carga**  ${tag(p.load.map((n) => dec(n, 2)).join(" "))}`,
    `**Event loop**  atraso ${tag(ms(loop.mean))} (máx. ${tag(ms(loop.max))})  ·  uso ${tag(loop.utilization === null ? "-" : percent(loop.utilization))}`,
  ];
  if (p.resources !== null) lines.push(`**Recursos ativos**  ${tag(p.resources)}`);
  lines.push(`**Hospedagem**  ${tag(p.host)}${p.commit ? `  ·  **Commit**  ${tag(p.commit)}` : ""}`);
  lines.push(`**Versões**  discord.js ${tag(p.discordJs)}  ·  mongoose ${tag(p.mongoose)}`);
  return lines.join("\n");
}

function discordSection(data) {
  const d = data.discord;
  const lines = [
    "### Discord",
    `**Conexão**  ${tag(d.statusName)}  ·  **Latência**  ${tag(d.ping >= 0 ? `${d.ping} ms` : "medindo")}`,
    `**Conectado há**  ${tag(span(d.uptime))}`,
    `**Shards**  ${tag(d.shards)}  ·  **Servidores**  ${tag(num(d.guilds))}`,
    `**Em cache**  ${tag(`${num(d.users)} usuários`)}  ·  ${tag(`${num(d.channels)} canais`)}`,
  ];
  if (d.guild) {
    lines.push(
      `**Neste servidor**  ${tag(`${num(d.guild.members)} de ${num(d.guild.memberCount)} membros`)}  ·  ${tag(`${num(d.guild.roles)} cargos`)}`
    );
  }
  lines.push(`**Comandos**  ${tag(`${d.commands} carregados`)}  ·  slash ${tag(d.slash)}  ·  prefixo ${tag(d.prefix)}`);
  return lines.join("\n");
}

function activitySection(data) {
  const c = data.counters;
  return [
    "### Atividade desde que ligou",
    `**Comandos**  prefixo ${tag(num(c.prefixo))}  ·  slash ${tag(num(c.slash))}`,
    `**Interações**  botões ${tag(num(c.botoes))}  ·  menus ${tag(num(c.menus))}  ·  modais ${tag(num(c.modais))}`,
    `**Problemas**  erros ${tag(num(c.erros))}  ·  limites ${tag(num(c.limites))}  ·  quedas ${tag(num(c.quedas))}`,
  ].join("\n");
}

function databaseSection(data, withCollections) {
  const db = data.db;
  const lines = ["### Banco de dados (MongoDB)", `**Estado**  ${tag(db.stateName)}${db.name ? `  ·  **Banco**  ${tag(db.name)}` : ""}`];

  if (!db.ready) {
    lines.push("-# Sem conexão com o MongoDB agora. Use o botão abaixo para ver o estado do cluster.");
    return lines.join("\n");
  }
  if (db.error) {
    lines.push(`**Ping**  ${tag("sem resposta")}`, `-# ${db.error}.`);
    return lines.join("\n");
  }

  lines.push(`**Latência (ping)**  ${tag(`${db.ping} ms`)}${db.version ? `  ·  **Versão**  ${tag(db.version)}` : ""}`);

  const s = db.stats;
  if (s) {
    lines.push(
      `**Coleções**  ${tag(num(s.collections ?? db.collectionCount))}  ·  **Documentos**  ${tag(num(s.objects))}`,
      `**Dados**  ${tag(bytes(s.dataSize))}  ·  **Armazenado**  ${tag(bytes(s.storageSize))}`,
      `**Índices**  ${tag(num(s.indexes))} (${tag(bytes(s.indexSize))})`
    );
  } else if (db.collectionCount !== null) {
    lines.push(`**Coleções**  ${tag(num(db.collectionCount))}`);
  }

  const top = db.collections.filter((c) => c.docs > 0).slice(0, 5);
  if (withCollections && top.length) {
    lines.push("-# Maiores coleções");
    for (const c of top) lines.push(`**${c.name}**  ${tag(`${num(c.docs)} docs`)}`);
  }
  return lines.join("\n");
}

// ---------- Painel ----------
function buildMetricsPanel(data) {
  const head = box().addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        text("## Métricas"),
        text(`Painel de **${data.bot.name}**\n-# Atualizado <t:${unix(data.at)}:T> · visão geral do bot, da memória, do processo e do banco de dados.`)
      )
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(data.bot.avatar))
  );

  // Se passar do limite de texto do Discord, a lista de coleções sai primeiro
  let sections = [
    healthSection(data),
    memorySection(data),
    processSection(data),
    discordSection(data),
    activitySection(data),
    databaseSection(data, true),
  ];
  const size = () => sections.reduce((sum, s) => sum + s.length, 0) + 400;
  if (size() > TEXT_LIMIT) sections[5] = databaseSection(data, false);

  const containers = sections.map((content) => box().addTextDisplayComponents(text(content)));

  const buttons = row(
    new ButtonBuilder().setLabel("Abrir MongoDB").setStyle(ButtonStyle.Link).setURL(mongoUrl()),
    new ButtonBuilder()
      .setCustomId("met:refresh")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ name: "update", id: "1569724363954065498", animated: true })
  );

  return [head, ...containers, buttons];
}

function buildNotice(content) {
  return [box().addTextDisplayComponents(text(content))];
}

module.exports = { buildMetricsPanel, buildNotice };
