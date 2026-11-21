// Leitura do perfil do Discord com a token definida pela staff.
// Nenhum dado do membro é guardado além do que o painel pede na hora.

const { invalidateToken } = require("./store");

const BASE = "https://discord.com/api/v10";

// Faz a chamada. Retorna { ok, status, data }.
async function discordGet(path, token) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: token },
  });
  return { ok: res.ok, status: res.status, data: res.ok ? await res.json() : null };
}

// Lê bio e pronomes do membro que clicou, usando a token que a staff definiu (nunca a do membro).
// GET /users/<id>/profile. Retorna null se a token da staff for inválida (401: ela é apagada) ou a leitura falhar.
// O status personalizado não vem desse endpoint: quem chama passa o texto lido da presença do membro.
async function fetchProfile(guildId, token, targetUserId, statusText = "") {
  const { ok, status, data } = await discordGet(
    `/users/${targetUserId}/profile?with_mutual_guilds=false&with_mutual_friends_count=false&guild_id=${guildId}`,
    token
  );

  if (status === 401) {
    await invalidateToken(guildId);
    return null;
  }
  if (!ok || !data) return null;

  return {
    bio: data.user_profile?.bio ?? data.user?.bio ?? "",
    status: statusText ?? "",
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
