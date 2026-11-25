// Acessa a API do Discord como conta de usuario (USER_TOKEN).
// Foco em nao ser flagrado: headers completos, respeito a Retry-After,
// sem abrir canal DM novo (so envia para quem ja tem conversa aberta).
//
// Configure USER_TOKEN no .env.

const https = require("node:https");

const USER_TOKEN = process.env.USER_TOKEN ?? "";

// User-Agent rotativo — simula sessoes diferentes do cliente web do Discord
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
];

function pickAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ---------- helper de requisicao ----------

// Respeita Retry-After automaticamente e tenta de novo uma vez em 429.
function request(path, method = "GET", body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "discord.com",
      path: `/api/v10${path}`,
      method,
      headers: {
        Authorization: USER_TOKEN,
        "Content-Type": "application/json",
        "User-Agent": pickAgent(),
        "Accept": "*/*",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Origin": "https://discord.com",
        "Referer": "https://discord.com/channels/@me",
        "X-Discord-Locale": "pt-BR",
        "X-Super-Properties": Buffer.from(
          JSON.stringify({ os: "Windows", browser: "Chrome", release_channel: "stable" })
        ).toString("base64"),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", async () => {
        try {
          const parsed = data ? JSON.parse(data) : null;

          // Rate limit: aguarda e tenta uma vez
          if (res.statusCode === 429) {
            const retryAfter = parseFloat(res.headers["retry-after"] ?? "5");
            await sleep(retryAfter * 1000 + jitter(500));
            resolve(await request(path, method, body));
            return;
          }

          resolve({ status: res.statusCode, body: parsed, headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, body: null, headers: res.headers });
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("timeout")); });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ---------- utilidades de timing ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Adiciona variacao aleatoria ao delay para nao parecer robotico
function jitter(base) {
  return Math.floor(Math.random() * base);
}

// ---------- API publica ----------

/**
 * Lista os servidores em que o USER_TOKEN esta.
 * @returns {Promise<Array<{id,name}>>}
 */
async function fetchUserGuilds() {
  if (!USER_TOKEN) return [];
  const { status, body } = await request("/users/@me/guilds?with_counts=false");
  if (status !== 200 || !Array.isArray(body)) return [];
  return body.map((g) => ({ id: g.id, name: g.name }));
}

/**
 * Busca IDs de membros humanos de um servidor.
 * Para de paginar quando atinge `limit`.
 * @param {string} guildId
 * @param {number} limit
 * @returns {Promise<string[]>}
 */
async function fetchGuildMemberIds(guildId, limit = 1000) {
  if (!USER_TOKEN) return [];

  const ids = [];
  let after = "0";

  while (ids.length < limit) {
    const take = Math.min(1000, limit - ids.length);
    const { status, body } = await request(
      `/guilds/${guildId}/members?limit=${take}&after=${after}`
    );
    if (status !== 200 || !Array.isArray(body) || body.length === 0) break;

    for (const m of body) {
      if (!m.user?.bot) ids.push(m.user.id);
    }

    if (body.length < take) break;
    after = body[body.length - 1].user.id;

    // Pausa entre paginas de membros
    await sleep(800 + jitter(400));
  }

  return ids.slice(0, limit);
}

/**
 * Busca os canais de DM ja abertos pela conta (historico de conversas).
 * Retorna um Map de userId -> channelId.
 * NAO abre canal novo — so usa os que ja existem.
 * @returns {Promise<Map<string, string>>}
 */
async function fetchExistingDmChannels() {
  if (!USER_TOKEN) return new Map();

  // /users/@me/channels retorna os canais privados abertos (DMs e grupos)
  const { status, body } = await request("/users/@me/channels");
  if (status !== 200 || !Array.isArray(body)) return new Map();

  const map = new Map();
  for (const ch of body) {
    // type 1 = DM individual
    if (ch.type === 1 && ch.id && ch.recipients?.[0]?.id) {
      map.set(ch.recipients[0].id, ch.id);
    }
  }
  return map;
}

/**
 * Envia uma mensagem num canal ja conhecido.
 * Retorna 'ok', 'ratelimit' ou 'error'.
 * @param {string} channelId
 * @param {string} content
 * @returns {Promise<'ok'|'ratelimit'|'error'>}
 */
async function sendToChannel(channelId, content) {
  try {
    const { status, headers } = await request(
      `/channels/${channelId}/messages`,
      "POST",
      { content }
    );
    if (status === 200) return "ok";
    if (status === 429) return "ratelimit";
    return "error";
  } catch {
    return "error";
  }
}

module.exports = {
  fetchUserGuilds,
  fetchGuildMemberIds,
  fetchExistingDmChannels,
  sendToChannel,
  sleep,
  jitter,
  USER_TOKEN,
};
