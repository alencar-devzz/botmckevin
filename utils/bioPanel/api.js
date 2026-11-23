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
// GET /users/<id>/profile. Retorna { error } quando não dá para ler:
//   "token"   = a token da staff é inválida (401: ela é apagada)
//   "private" = o Discord recusou ou não devolveu o perfil desse membro (403/404 ou perfil vazio)
//   "temp"    = falha passageira (limite de requisições, erro do Discord ou de rede)
// O status personalizado não vem desse endpoint: quem chama passa o texto lido da presença do membro.
async function fetchProfile(guildId, token, targetUserId, statusText = "") {
  let res;
  try {
    res = await discordGet(
      `/users/${targetUserId}/profile?with_mutual_guilds=false&with_mutual_friends_count=false&guild_id=${guildId}`,
      token
    );
  } catch {
    return { error: "temp" };
  }
  const { ok, status, data } = res;

  if (status === 401) {
    await invalidateToken(guildId);
    return { error: "token" };
  }
  if (status === 403 || status === 404) return { error: "private" };
  if (!ok || !data) return { error: "temp" };
  // Resposta válida, mas sem o bloco do perfil: o Discord não liberou os dados desse membro
  if (!data.user_profile) return { error: "private" };

  const bio = data.user_profile?.bio ?? data.user?.bio ?? "";
  const pronouns = data.user_profile?.pronouns ?? "";

  // Perfil privado: o Discord costuma responder 200 com o bloco do perfil, só que com bio e pronomes vazios,
  // em vez de recusar. Sem nada para ler, tratamos como privado (quem tem a bio mesmo vazia recebe o mesmo
  // aviso, que pede para deixar o perfil visível). Status e tag ainda podem liberar pelo fallback do painel.
  if (!String(bio).trim() && !String(pronouns).trim()) {
    // Diagnóstico: mostra nos logs da Render o que o Discord devolveu para esse perfil
    console.log("[bioPanel] perfil sem bio/pronomes:", targetUserId, "status", status, "chaves", Object.keys(data.user_profile ?? {}).join(","));
    return { error: "private" };
  }

  return {
    bio,
    status: statusText ?? "",
    pronouns,
  };
}

// Verifica se o perfil bate com as regras do painel.
// Retorna { passed: bool, details: string[] }
function checkProfile(profile, panel) {
  const { checkBio, checkStatus, checkPronouns, checkTag, patterns } = panel;
  const invite = panel.autoInvite?.code ? panel.autoInvite : null; // convite fixo do servidor (tela inicial)
  const details = [];

  // Usar a tag deste servidor no perfil basta, sem precisar dos padrões de texto
  if (checkTag && profile.tag) return { passed: true, details: [] };
  const noTag = "tag do servidor não encontrada no seu perfil";

  const fields = [];
  if (checkBio) fields.push({ name: "bio", value: profile.bio });
  if (checkStatus) fields.push({ name: "status", value: profile.status });
  if (checkPronouns) fields.push({ name: "pronomes", value: profile.pronouns });

  // Sem texto para conferir: só a tag decide (ou nada a conferir, se a tag também estiver desligada)
  if (!fields.length || (!patterns.length && !invite)) {
    return checkTag ? { passed: false, details: [noTag] } : { passed: true, details: [] };
  }

  const combined = fields.map((f) => f.value).join(" ").toLowerCase();

  for (const pattern of patterns) {
    if (!combined.includes(pattern.toLowerCase())) {
      details.push(`padrão não encontrado: \`${pattern}\``);
    }
  }

  // Convite fixo: vale a URL em qualquer forma comum (discord.gg/código ou discord.com/invite/código)
  if (invite) {
    const code = String(invite.code).toLowerCase();
    const forms = [`discord.gg/${code}`, `discord.com/invite/${code}`, `discordapp.com/invite/${code}`];
    if (!forms.some((f) => combined.includes(f))) details.push(`convite do servidor não encontrado: \`${invite.url}\``);
  }

  if (details.length && checkTag) details.push(noTag);
  return { passed: details.length === 0, details };
}

module.exports = { fetchProfile, checkProfile };
