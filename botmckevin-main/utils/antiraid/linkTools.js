// Ferramentas do Anti-link: encontrar links numa mensagem, classificar por tipo e
// comparar com listas de domínios. Funções puras, sem Discord e sem banco.

// ---------- Tipos de link ----------
// Domínios (e subdomínios) de cada tipo. "invite" e "gift" têm regras próprias abaixo.
const TYPE_DOMAINS = {
  youtube: ["youtube.com", "youtu.be", "youtube-nocookie.com"],
  twitch: ["twitch.tv"],
  social: [
    "instagram.com", "instagr.am", "tiktok.com", "twitter.com", "x.com", "facebook.com", "fb.com", "fb.me",
    "fb.watch", "threads.net", "reddit.com", "redd.it", "kick.com", "t.me", "telegram.me", "telegram.org",
    "wa.me", "whatsapp.com", "snapchat.com", "linkedin.com", "pinterest.com", "pin.it", "tumblr.com",
    "bsky.app", "kwai.com", "kw.ai",
  ],
  gif: ["tenor.com", "giphy.com", "gfycat.com", "gifer.com"],
  media: [
    "imgur.com", "prnt.sc", "prntscr.com", "gyazo.com", "postimg.cc", "ibb.co", "imgbb.com", "streamable.com",
    "medal.tv", "catbox.moe",
  ],
  files: [
    "mediafire.com", "mega.nz", "mega.io", "drive.google.com", "dropbox.com", "wetransfer.com", "we.tl",
    "gofile.io", "anonfiles.com", "transfer.sh", "sendspace.com", "4shared.com", "file.io", "pixeldrain.com",
  ],
  shortener: [
    "bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "cutt.ly", "rb.gy", "shorturl.at", "ow.ly", "buff.ly",
    "rebrand.ly", "tiny.cc", "v.gd", "bl.ink", "s.id", "lnkd.in", "shorte.st", "adf.ly", "linktr.ee",
  ],
};

// Hosts que são só de convite/divulgação de servidor
const INVITE_HOSTS = [
  "discord.gg", "dsc.gg", "invite.gg", "discord.me", "discord.io", "discord.link", "discord.new",
  "discordservers.com", "discord.st",
];
// Hosts onde só um caminho específico é convite (o resto do site é outra coisa)
const INVITE_PATHS = [
  { hosts: ["discord.com", "discordapp.com"], prefixes: ["/invite/", "/template/"] },
  { hosts: ["disboard.org"], prefixes: ["/server/"] },
  { hosts: ["top.gg"], prefixes: ["/servers/", "/discord/servers/"] },
  { hosts: ["discords.com"], prefixes: ["/servers/"] },
];
// Hosts em que o código do convite dá para resolver pela API do Discord
const RESOLVABLE = [
  { host: "discord.gg", prefix: "/" },
  { host: "discord.com", prefix: "/invite/" },
  { host: "discordapp.com", prefix: "/invite/" },
];

const GIFT_HOSTS = ["discord.gift"];
const GIFT_PATHS = [{ hosts: ["discord.com", "discordapp.com"], prefixes: ["/gifts/"] }];
const DISCORD_HOSTS = ["discord.com", "discordapp.com", "discordapp.net", "discord.media", "discordstatus.com"];

const MEDIA_EXT = /\.(?:png|jpe?g|gif|webp|bmp|svg|avif|heic|mp4|webm|mov|mkv|avi|mp3|wav|ogg|m4a|flac)$/i;
const FILE_EXT = /\.(?:exe|msi|bat|cmd|scr|com|apk|jar|ps1|vbs|zip|rar|7z|tar|gz|iso|dmg|pkg|deb)$/i;

// Terminações aceitas quando a pessoa escreve o domínio sem "https://".
// Lista curta de propósito: "tchau.me" ou "fui.to" (falta de espaço depois do ponto) não podem virar link.
const BARE_TLDS = new Set([
  "com", "net", "org", "gg", "io", "xyz", "app", "dev", "link", "info", "biz", "tv", "gl", "br", "ru", "gift",
  "site", "online", "store", "shop", "club", "live", "fun", "top", "click", "cc", "ly", "ws", "pw", "tk", "ml", "ga", "cf",
]);

// ---------- Utilidades ----------
const hostIs = (host, base) => host === base || host.endsWith(`.${base}`);
const hostIn = (host, list) => list.some((base) => hostIs(host, base));

// Deixa o texto mais fácil de analisar: tira caracteres invisíveis, troca letras "largas" por normais
// e desfaz disfarces comuns como "discord . gg / abc", "discord(dot)gg" e "discord gg/abc".
function normalize(content) {
  let text = String(content ?? "")
    .normalize("NFKC")
    .replace(/[​-‏⁠-⁤﻿­͏᠎]/g, "");

  text = text.replace(/\s*(?:\(\s*dot\s*\)|\[\s*dot\s*\]|\{\s*dot\s*\}|\(\s*\.\s*\)|\[\s*\.\s*\]|\{\s*\.\s*\})\s*/gi, ".");
  text = text.replace(/\b(discord|dsc|invite)\s*(?:\.|\s+dot\s+)\s*(gg|me|io|link|new)\s*([\/\\])\s*/gi, "$1.$2$3");
  text = text.replace(/\b(discord)\s+gg\s*([\/\\])\s*/gi, "$1.gg$2");
  text = text.replace(/\b(discord(?:app)?)\s*(?:\.|\s+dot\s+)\s*com\s*([\/\\])\s*(invite|template|gifts)\s*([\/\\])\s*/gi, "$1.com$2$3$4");
  return text;
}

// ---------- Classificação ----------
function classify(host, path) {
  const lowerPath = path.toLowerCase();

  // convite de servidor
  const inviteHost = INVITE_HOSTS.some((h) => hostIs(host, h));
  const invitePath = INVITE_PATHS.some(
    (r) => r.hosts.some((h) => hostIs(host, h)) && r.prefixes.some((p) => lowerPath.startsWith(p))
  );
  if (inviteHost || invitePath) {
    // código só quando dá para consultar no Discord
    let code = null;
    const rule = RESOLVABLE.find((r) => hostIs(host, r.host));
    if (rule && (rule.prefix === "/" || lowerPath.startsWith(rule.prefix))) {
      const rest = path.slice(rule.prefix.length).split("/")[0];
      if (/^[A-Za-z0-9-]{2,32}$/.test(rest)) code = rest;
    }
    return { type: "invite", code };
  }

  if (GIFT_HOSTS.some((h) => hostIs(host, h)) || GIFT_PATHS.some((r) => r.hosts.some((h) => hostIs(host, h)) && r.prefixes.some((p) => lowerPath.startsWith(p)))) {
    return { type: "gift", code: null };
  }
  if (DISCORD_HOSTS.some((h) => hostIs(host, h))) return { type: "discord", code: null };

  for (const [type, domains] of Object.entries(TYPE_DOMAINS)) {
    if (hostIn(host, domains)) return { type, code: null };
  }

  if (FILE_EXT.test(lowerPath)) return { type: "files", code: null };
  if (MEDIA_EXT.test(lowerPath)) return { type: "media", code: null };
  return { type: "other", code: null };
}

// ---------- Extração ----------
const TRAILING = /[.,;:!?)\]}>*_~|'"`]+$/;
const SCHEME_URL = /\b(?:https?|ftp):\/\/[^\s<>"'`]+/gi;
// host sem "https://": precisa vir depois de espaço/início (nada de e-mail, caminho ou outro domínio colado)
const BARE_URL = /(?<![@\w.\/:\\-])((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24})(?::\d{1,5})?((?:[\/?#][^\s<>"'`]*)?)/gi;

function parseHostAndPath(raw) {
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
    return {
      host: url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, ""),
      path: decodeSafe(url.pathname),
    };
  } catch {
    return null;
  }
}

function decodeSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// Devolve [{ raw, host, path, type, code }] sem repetir o mesmo link
function extractLinks(content, { bare = true } = {}) {
  let text = normalize(content);
  if (!text.trim()) return [];

  const found = [];
  const seen = new Set();
  const push = (raw, host, path) => {
    if (!host || !host.includes(".")) return;
    const info = classify(host, path);
    const key = `${host}${path}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ raw: raw.slice(0, 200), host, path, ...info });
  };

  // 1) links com https://
  text = text.replace(SCHEME_URL, (match) => {
    const clean = match.replace(TRAILING, "");
    const parsed = parseHostAndPath(clean);
    if (parsed) push(clean, parsed.host, parsed.path);
    return " ";
  });

  // 2) domínios sem https://
  if (bare) {
    for (const match of text.matchAll(BARE_URL)) {
      const hostText = match[1].toLowerCase().replace(/^www\./, "");
      const tld = hostText.slice(hostText.lastIndexOf(".") + 1);
      const path = (match[2] ?? "").replace(TRAILING, "");
      const pathOnly = decodeSafe(path.split(/[?#]/)[0]);
      const known = classify(hostText, pathOnly);
      // aceita se a terminação é segura OU se o domínio é de um tipo conhecido (ex.: discord.me, t.me, wa.me)
      if (BARE_TLDS.has(tld) || known.type !== "other") push(match[0].replace(TRAILING, ""), hostText, pathOnly);
    }
  }
  return found;
}

// ---------- Listas de domínios ----------

// "https://www.Site.com/pasta/?x=1" -> { host: "site.com", path: "/pasta", code }
// Aceita "*.site.com". Um caminho limita a regra àquela página (ex.: "discord.gg/meuservidor").
function parseDomainRule(input) {
  let text = String(input ?? "").trim().toLowerCase();
  if (!text) return null;
  text = text.replace(/^<|>$/g, "").replace(/^[a-z]+:\/\//, "").replace(/^[^/@]*@/, "").replace(/^\*\./, "").replace(/^www\./, "");
  text = text.split(/[?#]/)[0]; // consulta e âncora não fazem parte da regra
  const [hostPart, ...rest] = text.split("/");
  const host = hostPart.replace(/:\d+$/, "").replace(/\.$/, "");
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,24}$/.test(host)) return null;
  const path = `/${rest.filter(Boolean).join("/")}`;
  return { host, path: path === "/" ? "" : path };
}

// Forma que fica salva no banco: "host" ou "host/caminho"
const ruleToString = (rule) => `${rule.host}${rule.path}`;

// Lê um texto livre (linhas, vírgulas ou espaços) e devolve { list, invalid }
function parseDomainList(input, { max = 60, maxLen = 64 } = {}) {
  const tokens = String(input ?? "").split(/[\s,;]+/).filter(Boolean);
  const list = [];
  const invalid = [];
  for (const token of tokens) {
    const rule = parseDomainRule(token);
    const str = rule ? ruleToString(rule) : null;
    if (!str || str.length > maxLen) {
      invalid.push(token.slice(0, 40));
      continue;
    }
    if (!list.includes(str)) list.push(str);
  }
  return { list: list.slice(0, max), invalid, truncated: list.length > max };
}

// Convites escritos de formas diferentes valem o mesmo: discord.com/invite/abc == discord.gg/abc
function ruleCode(rule) {
  if (!rule.path) return null;
  if (hostIs(rule.host, "discord.gg")) return rule.path.slice(1).split("/")[0] || null;
  if (hostIs(rule.host, "discord.com") || hostIs(rule.host, "discordapp.com")) {
    const m = rule.path.match(/^\/invite\/([a-z0-9-]+)/);
    return m ? m[1] : null;
  }
  return null;
}

// A regra vale para o link? O host da regra inclui os subdomínios dele.
function ruleMatches(ruleString, link) {
  const rule = parseDomainRule(ruleString);
  if (!rule) return false;
  const code = ruleCode(rule);
  if (code) return !!link.code && link.code.toLowerCase() === code;
  if (!hostIs(link.host, rule.host)) return false;
  if (!rule.path) return true;
  const path = link.path.toLowerCase().replace(/\/+$/, "");
  return path === rule.path || path.startsWith(`${rule.path}/`);
}

const matchesAny = (rules, link) => (rules ?? []).some((rule) => ruleMatches(rule, link));

// Hosts cujo código de convite pode ser consultado no Discord
const isResolvableInvite = (link) => link.type === "invite" && !!link.code;

module.exports = {
  normalize,
  classify,
  extractLinks,
  parseDomainRule,
  parseDomainList,
  ruleToString,
  ruleMatches,
  matchesAny,
  isResolvableInvite,
  BARE_TLDS,
};
