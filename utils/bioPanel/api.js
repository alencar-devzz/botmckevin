// Leitura do perfil do Discord via token de usuário.
// Endpoints usados:
//   GET /users/@me          -> bio (bio), custom_status (status_text), pronouns
// Nenhum dado é guardado além do que o painel pede na hora.

const { invalidateToken } = require("./store");

const BASE = "https://discord.com/api/v10";

// Faz a chamada. Retorna { ok, status, data }.
async function discordGet(path, token) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: token },
  });
  return { ok: res.ok, status: res.status, data: res.ok ? await res.json() : null };
}

// Busca bio, status e pronomes de um usuário usando a token DELE.
// Retorna null se a token for inválida (401) e apaga do banco.
async function fetchProfile(guildId, token) {
  const { ok, status, data } = await discordGet("/users/@me", token);

  if (status === 401) {
    if (guildId) await invalidateToken(guildId);
    return null;
  }
  if (!ok || !data) return null;

  return {
    bio: data.bio ?? "",
    // O status customizado fica em connected_accounts mas o /users/@me
    // com token de usuário retorna user_profile.custom_status
    status: data.user_profile?.custom_status?.text ?? "",
    pronouns: data.user_profile?.pronouns ?? "",
  };
}

// Verifica se o perfil bate com as regras do painel.
// Retorna { passed: bool, details: string[] }
function checkProfile(profile, panel) {
  const { checkBio, checkStatus, checkPronouns, patterns } = panel;
  const details = [];

  const fields = [];
  if (checkBio) fields.push({ name: "bio", value: profile.bio });
  if (checkStatus) fields.push({ name: "status", value: profile.status });
  if (checkPronouns) fields.push({ name: "pronomes", value: profile.pronouns });

  if (!fields.length) return { passed: true, details: [] };
  if (!patterns.length) return { passed: true, details: [] };

  const combined = fields.map((f) => f.value).join(" ").toLowerCase();

  for (const pattern of patterns) {
    if (!combined.includes(pattern.toLowerCase())) {
      details.push(`padrão não encontrado: \`${pattern}\``);
    }
  }

  return { passed: details.length === 0, details };
}

module.exports = { fetchProfile, checkProfile };
