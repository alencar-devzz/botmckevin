// Campos de cada mensagem da Portaria no banco + padrões + leitura das configurações
const FIELDS = {
  welcome: {
    channel: "welcomeChannel",
    message: "welcomeMessage",
    enabled: "welcomeEnabled",
    style: "welcomeStyle",
    delay: "welcomeDeleteAfter",
    title: "welcomeTitle",
    footer: "welcomeFooter",
    color: "welcomeColor",
    images: "welcomeImages",
    thumb: "welcomeThumb",
  },
  leave: {
    channel: "leaveChannel",
    message: "leaveMessage",
    enabled: "leaveEnabled",
    style: "leaveStyle",
    delay: "leaveDeleteAfter",
    title: "leaveTitle",
    footer: "leaveFooter",
    color: "leaveColor",
    images: "leaveImages",
    thumb: "leaveThumb",
  },
  dm: {
    message: "dmMessage",
    enabled: "dmEnabled",
    style: "dmStyle",
    title: "dmTitle",
    footer: "dmFooter",
    color: "dmColor",
    images: "dmImages",
    thumb: "dmThumb",
  },
};

const GREETING_KINDS = ["welcome", "leave"];
const ALL_KINDS = ["welcome", "leave", "dm"];

// Padrões (também aceitam variáveis e marcadores). Título só aparece por padrão no formato Container.
const DEFAULTS = {
  welcome: {
    title: "### Novo membro",
    message: "Bem-vindo(a) ao **{server}**, {user}!",
    footer: "",
  },
  leave: {
    title: "### Saída de membro",
    message: "{user} saiu do servidor.",
    footer: "",
  },
  dm: {
    title: "### Bem-vindo(a) ao {server}",
    message: "Seja bem-vindo(a) ao **{server}**!",
    footer: "{separador}Mensagem enviada automaticamente pelo servidor **{server}**.",
  },
};

const THUMB_LABELS = {
  avatar: "Foto do membro",
  server: "Ícone do servidor",
  none: "Sem miniatura",
};

const isUrl = (value) => /^https?:\/\/\S+$/i.test(String(value ?? ""));

const thumbLabel = (value) => (isUrl(value) ? "Link personalizado" : THUMB_LABELS[value] ?? THUMB_LABELS.none);

// null/undefined = usa o padrão; "" = o dono deixou SEM texto de propósito
const textOr = (value, fallback) => (value == null ? fallback : value);

// Junta o que está salvo com os padrões
function resolveSettings(kind, config) {
  const f = FIELDS[kind];
  const style = config[f.style] === "text" ? "text" : "container";
  return {
    style,
    title: textOr(config[f.title], style === "container" ? DEFAULTS[kind].title : ""),
    message: textOr(config[f.message], DEFAULTS[kind].message) || DEFAULTS[kind].message,
    footer: textOr(config[f.footer], DEFAULTS[kind].footer),
    color: config[f.color] ?? null,
    thumb: config[f.thumb] ?? (kind === "dm" ? "none" : "avatar"),
    images: [...(config[f.images] ?? [])],
  };
}

module.exports = {
  FIELDS,
  GREETING_KINDS,
  ALL_KINDS,
  DEFAULTS,
  THUMB_LABELS,
  isUrl,
  thumbLabel,
  textOr,
  resolveSettings,
};
