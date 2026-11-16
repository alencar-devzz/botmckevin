// Busca a bio de um usuário do Discord usando o token de conta (user token).
// A API pública do bot não expõe a bio — apenas /users/:id?with_profile=true
// acessível com um token de conta consegue retornar esse campo.
//
// Configure a variável de ambiente USER_TOKEN com o token da sua conta.

const https = require("node:https");

const USER_TOKEN = process.env.USER_TOKEN ?? "";

/**
 * Busca a bio pública de um usuário pelo id.
 * @param {string} userId
 * @returns {Promise<string|null>} bio em texto ou null se não obtida
 */
const CACHE_OK_MS = 10 * 60 * 1000;   // bio encontrada: guarda 10 min
const CACHE_FAIL_MS = 60 * 1000;      // falha/sem bio: guarda 1 min
const cache = new Map();              // userId -> { bio, expires }

// fresh = true (clique em entrar): ignora o cache e consulta a bio de novo
async function fetchUserBio(userId, { fresh = false } = {}) {
  if (!USER_TOKEN) return null;

  const hit = cache.get(userId);
  if (!fresh && hit && hit.expires > Date.now()) return hit.bio;

  const bio = await requestBio(userId);
  cache.set(userId, { bio, expires: Date.now() + (bio === null ? CACHE_FAIL_MS : CACHE_OK_MS) });
  return bio;
}

function requestBio(userId) {

  return new Promise((resolve) => {
    const options = {
      hostname: "discord.com",
      path: `/api/v10/users/${userId}/profile?with_mutual_guilds=false&with_mutual_friends=false`,
      method: "GET",
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
          const json = JSON.parse(data);
          const bio =
            json?.user_profile?.bio ??
            json?.profile?.bio ??
            json?.user?.bio ??
            null;
          resolve(typeof bio === "string" ? bio : null);
        } catch {
          resolve(null);
        }
      });
    });

    req.on("error", () => resolve(null));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

module.exports = { fetchUserBio };
