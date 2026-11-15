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
  if (code === 50035) return "imagem ou nome inválido (a imagem deve ter até 256 KB)";
  return String(err?.message ?? "erro desconhecido").slice(0, 80);
}

function createSession({ interaction }) {
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

async function runJob(state, job) {
  state.current = job.name;
  scheduleFlush(state);
  try {
    if (job.size && job.size > MAX_FILE_BYTES) throw Object.assign(new Error("imagem maior que 256 KB"), { code: 50035 });
    const emoji = await state.guild.emojis.create({ attachment: job.url, name: job.name });
    state.ok.push(emoji.toString());
  } catch (err) {
    state.failed.push({ name: job.name, reason: reasonOf(err) });
  }
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
