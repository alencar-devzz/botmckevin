// Acessa a API do Discord como conta de usuario (USER_TOKEN) para:
//   - listar os servidores em que a conta esta
//   - buscar membros de um servidor
//   - enviar DM para um usuario
//
// Configure USER_TOKEN no .env.

const https = require("node:https");

const USER_TOKEN = process.env.USER_TOKEN ?? "";

// ---------- helper de requisicao ----------

function request(path, method = "GET", body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "discord.com",
      path: `/api/v10${path}`,
      method,
      headers: {
        Authorization: USER_TOKEN,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
        } catch {
          resolve({ status: res.statusCode, body: null });
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("timeout")); });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ---------- API publica ----------

/**
 * Retorna a lista de servidores em que o USER_TOKEN esta.
 * @returns {Promise<Array<{id,name,icon}>>}
 */
async function fetchUserGuilds() {
  if (!USER_TOKEN) return [];
  const { status, body } = await request("/users/@me/guilds");
  if (status !== 200 || !Array.isArray(body)) return [];
  return body.map((g) => ({ id: g.id, name: g.name, icon: g.icon }));
}

/**
 * Busca membros de um servidor pelo endpoint de listagem (requer que a conta esteja no servidor).
 * Retorna ate `limit` user IDs unicos (excluindo bots).
 * @param {string} guildId
 * @param {number} limit  maximo de membros a retornar (1–1000)
 * @returns {Promise<string[]>} array de userIds
 */
async function fetchGuildMemberIds(guildId, limit = 1000) {
  if (!USER_TOKEN) return [];

  const ids = [];
  let after = "0";
  const pageSize = 1000;

  while (ids.length < limit) {
    const take = Math.min(pageSize, limit - ids.length);
    const { status, body } = await request(
      `/guilds/${guildId}/members?limit=${take}&after=${after}`
    );
    if (status !== 200 || !Array.isArray(body) || body.length === 0) break;

    for (const m of body) {
      if (!m.user?.bot) ids.push(m.user.id);
    }

    if (body.length < take) break;
    after = body[body.length - 1].user.id;
  }

  return ids.slice(0, limit);
}

/**
 * Abre (ou reutiliza) um canal de DM com o usuario e retorna o channelId.
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
async function openDmChannel(userId) {
  const { status, body } = await request("/users/@me/channels", "POST", { recipient_id: userId });
  if (status !== 200 || !body?.id) return null;
  return body.id;
}

/**
 * Envia uma mensagem de texto num canal (DM aberto com openDmChannel).
 * @param {string} channelId
 * @param {string} content
 * @returns {Promise<boolean>}
 */
async function sendMessage(channelId, content) {
  const { status } = await request(`/channels/${channelId}/messages`, "POST", { content });
  return status === 200;
}

/**
 * Envia uma DM para um usuario.
 * Retorna true em caso de sucesso.
 * @param {string} userId
 * @param {string} content
 * @returns {Promise<boolean>}
 */
async function sendDm(userId, content) {
  try {
    const channelId = await openDmChannel(userId);
    if (!channelId) return false;
    return await sendMessage(channelId, content);
  } catch {
    return false;
  }
}

module.exports = { fetchUserGuilds, fetchGuildMemberIds, sendDm, USER_TOKEN };
