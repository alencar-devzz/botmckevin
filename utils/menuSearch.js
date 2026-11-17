const { SISTEMAS } = require("../ui/mainMenu");
const { COMUNIDADE_OPCOES } = require("../ui/comunidade");
const { MODERACAO_OPCOES } = require("../ui/moderacao");

// ---------------------------------------------------------------------------
// BUSCA DE SISTEMAS DO /menu
//
// A lista é montada sozinha a partir dos selects do menu (categorias + opções de cada categoria),
// então um sistema novo adicionado lá já aparece na busca. Para a busca entender apelidos e
// sinônimos ("boas-vindas", "giveaway", "log"...), adicione palavras em KEYWORDS abaixo.
// A chave é "grupo:value" (ex.: "comunidade:portaria").
// ---------------------------------------------------------------------------
const KEYWORDS = {
  "main:aparencia": ["avatar", "foto", "banner", "capa", "prefixo", "nome", "status", "atividade", "visual", "identidade", "bot"],
  "main:comunidade": ["interacao", "membros", "servidor", "engajamento"],
  "main:moderacao": ["moderar", "staff", "equipe", "seguranca", "atendimento"],
  "comunidade:portaria": ["boas vindas", "bem vindo", "bem vindos", "welcome", "entrada", "saida", "dm", "filtro", "conta", "idade", "recepcao", "join"],
  "comunidade:autoroles": ["autorole", "auto role", "cargo automatico", "cargos automaticos", "cargo ao entrar"],
  "comunidade:posts": ["post", "instagram", "insta", "foto", "video", "curtida", "comentario", "feed", "rede social"],
  "comunidade:calls": ["call", "voz", "voice", "temporaria", "sala", "canal de voz", "gatilho", "painel da call"],
  "comunidade:cl": ["limpar", "apagar mensagens", "clear", "comando"],
  "comunidade:spotify": ["musica", "som", "card", "letra", "ouvindo", "comando"],
  "comunidade:convites": ["convite", "invite", "invites", "fake", "recompensa", "conquista", "link de convite"],
  "comunidade:sorteios": ["sorteio", "giveaway", "gw", "premio", "rifa"],
  "moderacao:tickets": ["ticket", "atendimento", "suporte", "denuncia", "painel de ticket", "help desk"],
  "moderacao:logs": ["log", "registro", "auditoria", "historico", "mensagens apagadas", "banimentos", "audit"],
  "moderacao:cargos": ["cargo", "role", "groles", "gerenciar cargos", "permissao", "painel de cargos"],
  "moderacao:nuke": ["nnuke", "nuke", "recriar canal", "limpar canal", "resetar canal", "clonar canal", "comando"],
  "moderacao:bump": ["bump", "disboard", "lembrete", "divulgar", "bump reminder", "agradecimento"],
};

// Todos os sistemas pesquisáveis. group + value = o que o select de resultados devolve.
function buildRegistry() {
  const registry = [];
  for (const s of SISTEMAS) {
    registry.push({ group: "main", value: s.value, label: s.label, description: s.description, parent: null });
  }
  for (const o of COMUNIDADE_OPCOES) {
    registry.push({ group: "comunidade", value: o.value, label: o.label, description: o.description, parent: "Comunidade e interação" });
  }
  for (const o of MODERACAO_OPCOES) {
    registry.push({ group: "moderacao", value: o.value, label: o.label, description: o.description, parent: "Moderação" });
  }
  return registry.map((entry, index) => ({
    ...entry,
    index,
    key: `${entry.group}:${entry.value}`,
    keywords: KEYWORDS[`${entry.group}:${entry.value}`] ?? [],
  }));
}

// ---------- texto ----------

// minúsculo, sem acentos, sem pontuação ("Auto-roles" -> "auto roles", "Bump!" -> "bump")
function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set(["de", "do", "da", "dos", "das", "e", "o", "a", "os", "as", "em", "no", "na", "para", "com", "um", "uma", "que"]);

const words = (value) => normalize(value).split(" ").filter(Boolean);
const meaningful = (list) => list.filter((w) => !STOPWORDS.has(w));

// distância de edição (quantas letras trocar/colocar/tirar)
function distance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// Nota (0 a 1) de uma palavra digitada (t) contra uma palavra do sistema (w)
function wordScore(t, w) {
  if (t === w) return 1;
  if (t.length >= 2 && w.startsWith(t)) return 0.9; // texto cortado: "tick" -> "ticket"
  if (w.length >= 3 && t.startsWith(w)) return 0.8; // digitou a mais: "tickets" -> "ticket"
  if (t.length >= 5 && w.includes(t)) return 0.7; // pedaço do meio: "ronica" -> "eletronica"
  if (t.length >= 4 && w.length >= 4) {
    // erro de digitação, inteiro ou cortado: "tiket", "convte", "spotfy", "porteria"
    const limit = t.length >= 7 ? 2 : 1;
    const full = distance(t, w);
    if (full <= limit) return 0.75 - 0.05 * full;
    if (t.length >= 5 && distance(t, w.slice(0, t.length)) <= 1) return 0.66; // cortado e com erro: "spotf"
  }
  return 0;
}

// Nota total de um sistema para a busca (0 = não tem nada a ver)
function scoreEntry(entry, queryWords, queryNormalized) {
  const strong = meaningful([...words(entry.label), ...words(entry.keywords.join(" "))]);
  const weak = meaningful(words(entry.description));

  let sum = 0;
  let best = 0;
  for (const t of queryWords) {
    let tokenScore = 0;
    for (const w of strong) tokenScore = Math.max(tokenScore, wordScore(t, w));
    for (const w of weak) tokenScore = Math.max(tokenScore, wordScore(t, w) * 0.55); // descrição pesa menos
    sum += tokenScore;
    best = Math.max(best, tokenScore);
  }

  let score = sum / queryWords.length;
  if (best < 0.65 || score < 0.4) return 0;

  // frase inteira dentro do nome do sistema ("calls temp" em "Calls temporárias")
  const label = normalize(entry.label);
  if (queryNormalized === label) score += 0.3;
  else if (label.includes(queryNormalized)) score += 0.15;
  else if (normalize(entry.keywords.join(" | ")).includes(queryNormalized)) score += 0.1;

  return Math.min(score, 1.3);
}

// Retorna até `limit` sistemas parecidos com o texto, do mais para o menos parecido (com a nota de cada um).
function searchSystemsRanked(query, limit = 8) {
  const normalized = normalize(query);
  if (!normalized) return [];

  let queryWords = meaningful(normalized.split(" "));
  if (!queryWords.length) queryWords = normalized.split(" ");

  return buildRegistry()
    .map((entry) => ({ entry, score: scoreEntry(entry, queryWords, normalized) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.index - b.entry.index)
    .slice(0, limit)
    .map((r) => ({ ...r.entry, score: r.score }));
}

// Mesma busca, só com os sistemas (sem a nota)
function searchSystems(query, limit = 8) {
  return searchSystemsRanked(query, limit).map(({ score, ...entry }) => entry);
}

// A busca leva DIRETO ao sistema quando só um combina, ou quando um combina bem
// (nome/apelido exato) e os outros ficam bem atrás. Se houver dúvida, devolve null
// e o menu mostra a lista de sistemas encontrados.
const DIRECT_MIN_SCORE = 1; // nome ou apelido digitado por inteiro
const DIRECT_MIN_GAP = 0.3; // vantagem sobre o segundo colocado

function pickDirectMatch(ranked) {
  if (!ranked.length) return null;
  if (ranked.length === 1) return ranked[0];
  const [first, second] = ranked;
  if (first.score >= DIRECT_MIN_SCORE && first.score - second.score >= DIRECT_MIN_GAP) return first;
  return null;
}

module.exports = { searchSystems, searchSystemsRanked, pickDirectMatch, normalize, buildRegistry, KEYWORDS };
