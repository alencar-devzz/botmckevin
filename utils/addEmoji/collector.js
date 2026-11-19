const crypto = require("crypto");
const { MessageFlags } = require("discord.js");
const ui = require("../../ui/addEmoji");

// Coleta do comando /addemoji. Cada uso do comando cria uma sessão ligada ao canal e à pessoa: enquanto ela
// estiver ativa, os emojis (e imagens) que a pessoa enviar nesse canal são adicionados ao servidor. O painel
// é uma resposta efêmera da própria interação, editada aqui. O token da interação vale 15 minutos, então a
// sessão encerra sozinha um pouco antes disso.
const TTL_MS = 14 * 60 * 1000;
const FLUSH_MS = 900; // junta várias atualizações do painel em uma só (limite de edições do Discord)
const MAX_PER_INPUT = 50;
const MAX_FILE_BYTES = 256 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const DOWNLOAD_TIMEOUT_MS = 15_000; // baixar a imagem nunca pode prender a fila
const CREATE_TIMEOUT_MS = 60_000; // criar o emoji nunca pode prender a fila
const MAX_RATE_RETRIES = 3;

const sessions = new Map(); // sid -> state
const byKey = new Map(); // guildId:channelId:userId -> sid

const keyOf = (guildId, channelId, userId) => `${guildId}:${channelId}:${userId}`;

// ---------- Leitura de emojis ----------

const CUSTOM_RE = /<(a?):([A-Za-z0-9_]{2,32}):(\d{17,21})>/g;
// Sem Nitro, o Discord troca o emoji de outro servidor por um link da CDN ao enviar a mensagem
const CDN_RE = /https?:\/\/cdn\.discordapp\.com\/emojis\/(\d{17,21})\.(?:png|webp|gif|jpe?g)(?:\?([^\s<>]*))?/gi;

const emojiUrl = (id, animated) =>
  `https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "png"}?size=${animated ? 96 : 128}&quality=lossless`;

function cleanName(value, fallback = "emoji") {
  let name = String(value ?? "").replace(/[^A-Za-z0-9_]/g, "_").slice(0, 32);
  if (name.length < 2) name = fallback;
  return name;
}

// Procura emojis personalizados num texto: <:nome:id>, <a:nome:id> e links de emoji da CDN
function parseEmojis(content) {
  const found = new Map();
  const text = String(content ?? "");

  for (const m of text.matchAll(CUSTOM_RE)) {
    const [, anim, name, id] = m;
    if (!found.has(id)) found.set(id, { id, name: cleanName(name), url: emojiUrl(id, anim === "a") });
  }
  for (const m of text.matchAll(CDN_RE)) {
    const id = m[1];
    const params = new URLSearchParams(m[2] ?? "");
    const animated = /\.gif/i.test(m[0]) || params.get("animated") === "true";
    if (!found.has(id)) found.set(id, { id, name: cleanName(params.get("name") ?? `emoji_${id.slice(-4)}`), url: emojiUrl(id, animated) });
  }
  return [...found.values()].slice(0, MAX_PER_INPUT).map(({ name, url }) => ({ name, url }));
}

// Imagens anexadas viram emoji com o nome do arquivo
function parseAttachments(attachments) {
  const jobs = [];
  for (const file of attachments?.values?.() ?? []) {
    if (!IMAGE_TYPES.includes(String(file.contentType ?? "").split(";")[0])) continue;
    const base = String(file.name ?? "emoji").replace(/\.[^.]+$/, "");
    jobs.push({ name: cleanName(base), url: file.url, size: file.size ?? 0 });
  }
  return jobs.slice(0, MAX_PER_INPUT);
}

// ---------- Sessão ----------

function reasonOf(err) {
  const code = err?.code;
  if (code === 30008) return "limite de emojis do servidor atingido";
  if (code === 50013 || code === 50001) return "o bot não tem permissão para criar emojis";
  if (code === 50035) return err?.rawError?.errors ? `recusado pelo Discord: ${JSON.stringify(err.rawError.errors).slice(0, 70)}` : "imagem ou nome inválido (a imagem deve ter até 256 KB)";
  return String(err?.message || err?.name || "erro desconhecido").slice(0, 90);
}

// O nome do erro do discord.js vem como "RateLimitError[/guilds/:id/emojis]" e a mensagem vem vazia
const isRateLimit = (err) => String(err?.name ?? "").startsWith("RateLimitError") || (err?.timeToReset != null && err?.route != null);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(message), { code: "TIMEOUT" })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Baixa a imagem aqui (com tempo limite) em vez de deixar o discord.js baixar sem limite nenhum
async function downloadImage(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`não consegui baixar a imagem (HTTP ${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_FILE_BYTES) throw Object.assign(new Error("imagem maior que 256 KB"), { code: 50035 });
  return buffer;
}

// O discord.js, ao bater no limite de criação de emojis, espera em silêncio (às vezes por muitos minutos) e o
// painel parecia travado. Aqui o limite de emojis passa a gerar um erro na hora e a fila espera de forma visível.
function installRateLimitGuard(client) {
  const rest = client?.rest;
  if (!rest?.options || rest.options.__emojiGuard) return;
  const previous = rest.options.rejectOnRateLimit;
  rest.options.rejectOnRateLimit = async (data) => {
    if (!data?.global && /\/emojis/i.test(String(data?.route ?? "")) && String(data?.method).toUpperCase() === "POST") return true;
    if (typeof previous === "function") return previous(data);
    if (Array.isArray(previous)) return previous.some((route) => String(data?.route ?? "").startsWith(route.toLowerCase()));
    return Boolean(previous);
  };
  rest.options.__emojiGuard = true;
}

// Espera o limite acabar, mas acorda na hora se a sessão for encerrada
async function waitForReset(state, ms) {
  await Promise.race([wait(ms), new Promise((resolve) => (state.wake = resolve))]);
  state.wake = null;
}

function createSession({ interaction }) {
  installRateLimitGuard(interaction.client);
  const sid = crypto.randomBytes(4).toString("hex");
  const state = {
    sid,
    userId: interaction.user.id,
    guild: interaction.guild,
    channelId: interaction.channelId,
    interaction,
    total: 0,
    done: 0,
    ok: [], // marcação dos emojis criados
    failed: [], // { name, reason }
    current: null,
    waitUntil: 0, // enquanto o Discord limita a criação de emojis, quando a fila volta
    wake: null,
    chain: Promise.resolve(),
    closed: false,
    reason: null,
    expiresAt: Date.now() + TTL_MS,
    flushTimer: null,
    expireTimer: null,
  };

  const key = keyOf(interaction.guildId, interaction.channelId, interaction.user.id);
  const previous = sessions.get(byKey.get(key));
  if (previous) publishFinal(previous, "replaced").catch(() => {}); // um painel novo no mesmo canal encerra o anterior

  sessions.set(sid, state);
  byKey.set(key, sid);
  state.key = key;
  state.expireTimer = setTimeout(() => publishFinal(state, "expired").catch(() => {}), TTL_MS);
  return state;
}

const getSession = (sid) => sessions.get(sid) ?? null;
const findSession = (guildId, channelId, userId) => sessions.get(byKey.get(keyOf(guildId, channelId, userId))) ?? null;

// ---------- Fila ----------

async function createEmoji(state, job) {
  const attachment = job.size && job.size > MAX_FILE_BYTES
    ? (() => { throw Object.assign(new Error("imagem maior que 256 KB"), { code: 50035 }); })()
    : await downloadImage(job.url);
  return withTimeout(state.guild.emojis.create({ attachment, name: job.name }), CREATE_TIMEOUT_MS, "o Discord demorou demais para responder");
}

async function runJob(state, job) {
  state.current = job.name;
  scheduleFlush(state);
  try {
    let emoji = null;
    for (let attempt = 0; !emoji; attempt++) {
      try {
        emoji = await createEmoji(state, job);
      } catch (err) {
        if (!isRateLimit(err)) throw err;
        const ms = Math.max(Number(err.timeToReset ?? err.retryAfter) || 0, 1000) + 500;
        const left = state.expiresAt - Date.now();
        if (state.closed) throw Object.assign(new Error("encerrado durante o limite do Discord"), { code: "STOPPED" });
        if (attempt >= MAX_RATE_RETRIES || ms > left - 5000) {
          const volta = Math.ceil((Date.now() + ms) / 1000);
          throw Object.assign(new Error(`limite do Discord para criar emojis, libera <t:${volta}:R>`), { code: "RATE" });
        }
        state.waitUntil = Date.now() + ms;
        scheduleFlush(state);
        await waitForReset(state, ms);
        state.waitUntil = 0;
      }
    }
    state.ok.push(emoji.toString());
  } catch (err) {
    console.error(`[ADDEMOJI] Falha ao criar "${job.name}":`, err?.code ?? "", err?.name ?? "", err?.message ?? "", err?.rawError ? JSON.stringify(err.rawError).slice(0, 300) : "");
    state.failed.push({ name: job.name, reason: reasonOf(err) });
  }
  state.waitUntil = 0;
  state.done += 1;
  state.current = null;
  scheduleFlush(state);
}

function enqueue(state, jobs) {
  if (state.closed || !jobs.length) return;
  state.total += jobs.length;
  for (const job of jobs) state.chain = state.chain.then(() => runJob(state, job)).catch(() => {});
  scheduleFlush(state);
}

// ---------- Painel ----------

function scheduleFlush(state) {
  if (state.closed || state.flushTimer) return;
  state.flushTimer = setTimeout(() => {
    state.flushTimer = null;
    if (state.closed) return;
    state.interaction
      .editReply({ components: ui.buildActive(state), flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } })
      .catch((err) => console.error("[ADDEMOJI] Não consegui atualizar o painel:", err?.message ?? err));
  }, FLUSH_MS);
}

// Fecha a sessão (para de receber, espera a fila terminar) e devolve o painel final
async function finalize(state, reason) {
  if (!state.closed) {
    state.closed = true;
    state.reason = reason;
    clearTimeout(state.flushTimer);
    clearTimeout(state.expireTimer);
    state.flushTimer = null;
  }
  state.wake?.(); // se a fila estiver esperando o limite do Discord, não prende o encerramento
  await state.chain;
  sessions.delete(state.sid);
  if (byKey.get(state.key) === state.sid) byKey.delete(state.key);
  return { components: ui.buildFinal(state), flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

async function publishFinal(state, reason) {
  if (state.closed) return;
  const payload = await finalize(state, reason);
  await state.interaction.editReply(payload);
}

module.exports = {
  TTL_MS,
  parseEmojis,
  parseAttachments,
  cleanName,
  createSession,
  getSession,
  findSession,
  enqueue,
  finalize,
};
