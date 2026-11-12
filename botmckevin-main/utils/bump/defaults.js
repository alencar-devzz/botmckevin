// Padrões do Bump Reminder (n!menu > Moderação > Bump reminder).

const DISBOARD_ID = "302050872383242240";

// Textos que o DISBOARD (e outros bots de bump) usam ao confirmar um bump, em vários idiomas.
// Tudo em minúsculas. Dá para trocar no painel (Tempos e detecção).
const DEFAULT_SUCCESS_KEYWORDS = [
  "bump done",
  "bump feito",
  "bump realizado",
  "bump effectué",
  "bump hecho",
  "bump fatto",
  "bump erfolgreich",
];

const DEFAULT_COLOR = "#5865F2";

const MESSAGE_DEFAULTS = {
  reminder: {
    mode: "container",
    containerText: "## <:alert:1569387419634106448> Hora de dar bump!\nDigite /bump neste Canal e ajude o servidor!",
    containerColor: "",
    containerThumbnail: "",
    containerImage: "",
    thumbnailServer: false,
    text: "## <:alert:1569387419634106448> Hora de dar bump!\nDigite /bump neste Canal e ajude o servidor!",
    embedTitle: "<:alert:1569387419634106448> Hora de dar bump!",
    embedUrl: "",
    embedDescription: "Digite /bump neste Canal e ajude o servidor!",
    embedColor: DEFAULT_COLOR,
    embedFooter: "",
    embedFooterIcon: "",
    embedAuthor: "",
    embedAuthorIcon: "",
    embedThumbnail: "",
    embedImage: "",
    embedTimestamp: false,
  },
  thanks: {
    mode: "container",
    containerText: "## Bump!\nTmj negão, próximo Bump em `{interval}`\n-# proximo bump: {next}",
    containerColor: "",
    containerThumbnail: "",
    containerImage: "",
    thumbnailServer: false,
    text: "## Bump!\nTmj negão, próximo Bump em `{interval}`\n-# proximo bump: {next}",
    embedTitle: "Bump!",
    embedUrl: "",
    embedDescription: "Tmj negão, próximo Bump em `{interval}`\n-# proximo bump: {next}",
    embedColor: DEFAULT_COLOR,
    embedFooter: "",
    embedFooterIcon: "",
    embedAuthor: "",
    embedAuthorIcon: "",
    embedThumbnail: "",
    embedImage: "",
    embedTimestamp: false,
  },
};

const KIND_LABEL = { reminder: "Lembrete de bump", thanks: "Agradecimento do bump" };

// Variáveis que dá para usar em qualquer texto das mensagens
const VARIABLES = [
  ["{user}", "marca quem deu o bump (no lembrete: quem deu o último)"],
  ["{user_name}", "nome dessa pessoa"],
  ["{roles}", "marca os cargos escolhidos"],
  ["{interval}", "tempo entre bumps (ex.: 2 hrs)"],
  ["{next}", "próximo bump, relativo (<t:…:R>)"],
  ["{next_time}", "próximo bump, horário (<t:…:t>)"],
  ["{next_date}", "próximo bump, data e hora (<t:…:f>)"],
  ["{last_bump}", "quando foi o último bump, relativo"],
  ["{server}", "nome do servidor"],
  ["{channel}", "canal do lembrete"],
  ["{total}", "total de bumps dados"],
];

module.exports = {
  DISBOARD_ID,
  DEFAULT_SUCCESS_KEYWORDS,
  DEFAULT_COLOR,
  MESSAGE_DEFAULTS,
  KIND_LABEL,
  VARIABLES,
};
