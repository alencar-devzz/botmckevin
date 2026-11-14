// Letras pela API pública do LRCLIB (https://lrclib.net), sem chave de acesso.
const BASE = "https://lrclib.net/api";
const HEADERS = { "User-Agent": "botmckevin (https://github.com/alencar-devzz/botmckevin)" };

async function getJson(path, params) {
  try {
    const res = await fetch(`${BASE}${path}?${new URLSearchParams(params)}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// "Música - Remastered 2011" / "Música (feat. Fulano)" -> "Música"
const cleanTitle = (title) =>
  title.replace(/\s*[(\[].*?[)\]]/g, "").replace(/\s+-\s+.*$/, "").trim() || title;

// Retorna { text } com a letra, { instrumental: true } ou null se não achar.
async function fetchFromLrclib({ title, artists, album, durationMs }) {
  const artist = artists.split(";")[0].trim();
  const seconds = Math.round(durationMs / 1000);

  let data = null;
  if (album && seconds) {
    data = await getJson("/get", {
      track_name: title,
      artist_name: artist,
      album_name: album,
      duration: String(seconds),
    });
  }

  if (!data?.plainLyrics && !data?.instrumental) {
    const list = await getJson("/search", { track_name: cleanTitle(title), artist_name: artist });
    if (Array.isArray(list)) {
      const withLyrics = list.filter((i) => i.plainLyrics?.trim());
      // Prefere a versão com a mesma duração (até 5 segundos de diferença)
      data =
        withLyrics.find((i) => seconds && Math.abs(i.duration - seconds) <= 5) ??
        withLyrics[0] ??
        list.find((i) => i.instrumental) ??
        null;
    }
  }

  if (data?.plainLyrics?.trim()) return { text: data.plainLyrics.trim() };
  if (data?.instrumental) return { instrumental: true };
  return null;
}

// Vagalume (https://api.vagalume.com.br): precisa de uma chave grátis na variável VAGALUME_API_KEY.
const VAGALUME_KEY = () => process.env.VAGALUME_API_KEY || "";
const vagalumeAvailable = () => Boolean(VAGALUME_KEY());

async function fetchFromVagalume({ title, artists }) {
  if (!vagalumeAvailable()) return null;
  try {
    const params = new URLSearchParams({
      art: artists.split(";")[0].trim(),
      mus: cleanTitle(title),
      apikey: VAGALUME_KEY(),
    });
    const res = await fetch(`https://api.vagalume.com.br/search.php?${params}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.mus?.[0]?.text?.trim();
    return text ? { text } : null;
  } catch {
    return null;
  }
}

// source: "lrclib" | "vagalume" | "off". O Vagalume cai para o LRCLIB se não achar a letra.
// Retorna { text, source } | { instrumental: true } | null
async function fetchLyrics(track, source = "lrclib") {
  if (source === "off") return null;

  if (source === "vagalume") {
    const found = await fetchFromVagalume(track);
    if (found) return { ...found, source: "vagalume" };
  }

  const found = await fetchFromLrclib(track);
  return found?.text ? { ...found, source: "lrclib" } : found;
}

const SOURCE_NAME = { lrclib: "LRCLIB", vagalume: "Vagalume" };

// Divide a letra em partes por linha (cada mensagem em Components V2 aceita ~4000 caracteres no total).
function splitLyrics(text, size = 3300) {
  const parts = [];
  let current = "";
  for (const line of text.split("\n")) {
    if (current && current.length + line.length + 1 > size) {
      parts.push(current.trimEnd());
      current = "";
    }
    current += `${line}\n`;
  }
  if (current.trim()) parts.push(current.trimEnd());
  return parts;
}

module.exports = { fetchLyrics, splitLyrics, vagalumeAvailable, SOURCE_NAME };
