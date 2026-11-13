const os = require("node:os");
const v8 = require("node:v8");
const { performance, monitorEventLoopDelay } = require("node:perf_hooks");
const mongoose = require("mongoose");
const discord = require("discord.js");
const { logsConnection, isSeparate: logsSeparate } = require("../database/logsConnection");

// Coleta tudo o que o comando metricas mostra: Discord, memória (RAM), processo, banco de dados e saúde geral.
// Nada aqui altera o bot: só lê números do Node, do discord.js e do MongoDB.

// ---------- Contadores desde que o bot ligou ----------
// track("prefixo") etc. é chamado por events/messageCreate.js, events/interactionCreate.js e events/metricsCollector.js
const counters = { prefixo: 0, slash: 0, botoes: 0, menus: 0, modais: 0, autocomplete: 0, erros: 0, limites: 0, quedas: 0 };

function track(name, amount = 1) {
  if (name in counters) counters[name] += amount;
}

// ---------- Event loop e CPU (medidos entre uma atualização e outra) ----------
const LOOP_RESOLUTION = 20; // ms
const loopDelay = monitorEventLoopDelay({ resolution: LOOP_RESOLUTION });
loopDelay.enable();
let lastElu = performance.eventLoopUtilization();
let lastCpu = { usage: process.cpuUsage(), at: process.hrtime.bigint(), pct: null };

function eventLoopInfo() {
  // O histograma conta o intervalo do timer inteiro: tira a resolução para sobrar só o atraso
  const lag = (ns) => (Number.isFinite(ns) && ns > 0 ? Math.max(0, ns / 1e6 - LOOP_RESOLUTION) : null);
  const info = { mean: lag(loopDelay.mean), p99: lag(loopDelay.percentile(99)), max: lag(loopDelay.max), utilization: null };
  loopDelay.reset();

  const now = performance.eventLoopUtilization();
  const delta = performance.eventLoopUtilization(now, lastElu);
  lastElu = now;
  if (Number.isFinite(delta.utilization)) info.utilization = delta.utilization;
  return info;
}

function cpuPercent() {
  const nowAt = process.hrtime.bigint();
  const elapsedUs = Number(nowAt - lastCpu.at) / 1000;
  // Menos de 1s desde a última leitura: repete o valor anterior (evita número solto por atualizar rápido demais)
  if (elapsedUs < 1_000_000 && lastCpu.pct !== null) return lastCpu.pct;

  const usage = process.cpuUsage();
  const usedUs = usage.user - lastCpu.usage.user + (usage.system - lastCpu.usage.system);
  const pct = elapsedUs > 0 ? Math.max(0, (usedUs / elapsedUs) * 100) : 0;
  lastCpu = { usage, at: nowAt, pct };
  return pct;
}

// ---------- Memória ----------
function memoryInfo() {
  const mem = process.memoryUsage();
  const heap = v8.getHeapStatistics();
  const total = os.totalmem();

  // Limite do container (Render, Docker...). Sem limite, o Node devolve 0 ou um número maior que a RAM do host.
  const constrained = typeof process.constrainedMemory === "function" ? process.constrainedMemory() : 0;
  const limit = constrained > 0 && constrained < total ? constrained : null;

  return {
    rss: mem.rss,
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    heapLimit: heap.heap_size_limit,
    external: mem.external,
    arrayBuffers: mem.arrayBuffers,
    limit,
    hostTotal: total,
    hostFree: os.freemem(),
    ratio: limit ? mem.rss / limit : mem.heapUsed / heap.heap_size_limit,
  };
}

// ---------- Processo ----------
function processInfo() {
  return {
    pid: process.pid,
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    cores: typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length,
    uptime: process.uptime() * 1000,
    cpu: cpuPercent(),
    load: os.loadavg(),
    resources: typeof process.getActiveResourcesInfo === "function" ? process.getActiveResourcesInfo().length : null,
    host: process.env.RENDER ? "Render" : "Local",
    commit: process.env.RENDER_GIT_COMMIT ? process.env.RENDER_GIT_COMMIT.slice(0, 7) : null,
    discordJs: discord.version,
    mongoose: mongoose.version,
    loop: eventLoopInfo(),
  };
}

// ---------- Discord ----------
const STATUS_NAMES = {
  0: "Conectado",
  1: "Conectando",
  2: "Reconectando",
  3: "Ocioso",
  4: "Quase pronto",
  5: "Desconectado",
  6: "Aguardando servidores",
  7: "Identificando",
  8: "Retomando",
};

function discordInfo(client, guild) {
  const commands = new Set(client.commands?.values() ?? []);
  return {
    status: client.ws.status,
    statusName: STATUS_NAMES[client.ws.status] ?? "Desconhecido",
    ping: client.ws.ping, // -1 logo depois de conectar
    uptime: client.uptime ?? 0,
    shards: client.ws.shards?.size ?? 1,
    guilds: client.guilds.cache.size,
    users: client.users.cache.size,
    channels: client.channels.cache.size,
    commands: commands.size,
    slash: [...commands].filter((c) => c.data).length,
    prefix: [...commands].filter((c) => typeof c.execute === "function").length,
    guild: guild
      ? {
          name: guild.name,
          members: guild.members.cache.size,
          memberCount: guild.memberCount,
          roles: guild.roles.cache.size,
          channels: guild.channels.cache.size,
        }
      : null,
  };
}

// ---------- Banco de dados ----------
const DB_STATES = { 0: "Desconectado", 1: "Conectado", 2: "Conectando", 3: "Desconectando" };
const HEAVY_CACHE_MS = 30_000; // estatísticas pesadas ficam guardadas para não sobrecarregar o banco
const heavyCaches = new WeakMap(); // uma cache por conexão (banco principal e banco de mensagens)

const withTimeout = (promise, ms, label) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} sem resposta`)), ms))]);

async function loadHeavy(db, cacheKey) {
  const cached = heavyCaches.get(cacheKey);
  if (cached && Date.now() - cached.at < HEAVY_CACHE_MS) return cached.value;

  const value = { stats: null, version: null, collections: [], collectionCount: null };

  // As três consultas rodam juntas; se alguma falhar (sem permissão ou banco lento), o painel mostra só o que conseguiu
  await Promise.all([
    (async () => {
      try {
        const s = await withTimeout(db.command({ dbStats: 1, scale: 1 }), 4000, "dbStats");
        value.stats = {
          collections: s.collections ?? null,
          objects: s.objects ?? null,
          dataSize: s.dataSize ?? null,
          storageSize: s.storageSize ?? null,
          indexes: s.indexes ?? null,
          indexSize: s.indexSize ?? null,
        };
      } catch {}
    })(),
    (async () => {
      try {
        const info = await withTimeout(db.admin().command({ buildInfo: 1 }), 4000, "buildInfo");
        value.version = info.version ?? null;
      } catch {}
    })(),
    (async () => {
      try {
        const list = await withTimeout(db.listCollections({}, { nameOnly: true }).toArray(), 4000, "listCollections");
        value.collectionCount = list.length;
        const counted = await withTimeout(
          Promise.allSettled(list.map((c) => db.collection(c.name).estimatedDocumentCount())),
          5000,
          "contagem"
        );
        value.collections = list
          .map((c, i) => ({ name: c.name, docs: counted[i].status === "fulfilled" ? counted[i].value : 0 }))
          .sort((a, b) => b.docs - a.docs);
      } catch {}
    })(),
  ]);

  heavyCaches.set(cacheKey, { at: Date.now(), value });
  return value;
}

// Lê o estado de uma conexão do MongoDB (padrão: o banco principal)
async function databaseInfo(conn = mongoose.connection) {
  const info = {
    state: conn.readyState,
    stateName: DB_STATES[conn.readyState] ?? "Desconhecido",
    ready: conn.readyState === 1 && Boolean(conn.db),
    name: conn.name || null,
    ping: null,
    error: null,
    stats: null,
    version: null,
    collections: [],
    collectionCount: null,
  };
  if (!info.ready) return info;

  try {
    const started = Date.now();
    await withTimeout(conn.db.admin().ping(), 4000, "ping");
    info.ping = Date.now() - started;
  } catch (err) {
    info.error = err.message;
    return info;
  }

  const heavy = await loadHeavy(conn.db, conn);
  return { ...info, ...heavy };
}

// ---------- Saúde ----------
// nível: 0 = saudável, 1 = atenção, 2 = crítico
function judge({ discord: d, db, memory, proc }) {
  const levels = { discord: 0, db: 0, memory: 0, cpu: 0, loop: 0 };
  const notes = [];
  const flag = (key, level, note) => {
    if (level > levels[key]) levels[key] = level;
    if (level > 0) notes.push(note);
  };

  if (d.status !== 0) flag("discord", d.status === 5 ? 2 : 1, `Gateway: ${d.statusName.toLowerCase()}`);
  if (d.ping >= 600) flag("discord", 2, `Latência do Discord muito alta (${d.ping} ms)`);
  else if (d.ping >= 250) flag("discord", 1, `Latência do Discord alta (${d.ping} ms)`);

  if (!db.ready) flag("db", db.state === 0 ? 2 : 1, `Banco de dados: ${db.stateName.toLowerCase()}`);
  else if (db.error) flag("db", 1, "Banco de dados não respondeu ao ping");
  else if (db.ping >= 1000) flag("db", 2, `Banco de dados muito lento (${db.ping} ms)`);
  else if (db.ping >= 300) flag("db", 1, `Banco de dados lento (${db.ping} ms)`);

  const pct = Math.round(memory.ratio * 100);
  if (memory.ratio >= 0.85) flag("memory", 2, `Memória quase no limite (${pct}%)`);
  else if (memory.ratio >= 0.7) flag("memory", 1, `Memória em ${pct}%`);

  const cpu = proc.cpu;
  if (cpu >= 95) flag("cpu", 2, `CPU no limite (${Math.round(cpu)}%)`);
  else if (cpu >= 80) flag("cpu", 1, `CPU alta (${Math.round(cpu)}%)`);

  const loop = proc.loop;
  if (loop.p99 !== null && loop.p99 >= 400) flag("loop", 2, `Event loop travando (${Math.round(loop.p99)} ms)`);
  else if (loop.p99 !== null && loop.p99 >= 100) flag("loop", 1, `Event loop atrasado (${Math.round(loop.p99)} ms)`);
  else if (loop.utilization !== null && loop.utilization >= 0.9) flag("loop", 1, "Event loop quase sempre ocupado");

  return { levels, notes, overall: Math.max(...Object.values(levels)) };
}

// ---------- Tudo junto ----------
async function collectMetrics(client, guild) {
  const memory = memoryInfo();
  const proc = processInfo();
  const d = discordInfo(client, guild);
  const [db, dbLogsInfo] = await Promise.all([
    databaseInfo(),
    logsSeparate ? databaseInfo(logsConnection) : Promise.resolve(null),
  ]);
  // Banco de mensagens (logs): só existe como segundo banco se MONGO_URI_LOGS estiver definida
  const dbLogs = { separate: logsSeparate, ...(dbLogsInfo ?? db) };

  return {
    at: Date.now(),
    bot: { name: client.user.username, avatar: client.user.displayAvatarURL({ extension: "png", size: 256 }) },
    discord: d,
    memory,
    proc,
    db,
    dbLogs,
    counters: { ...counters },
    health: judge({ discord: d, db, memory, proc }),
  };
}

module.exports = { track, collectMetrics };
