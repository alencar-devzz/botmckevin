// Padrões do comando nnuke (n!menu > Moderação > Comando nnuke).

const DEFAULT_EMBED_COLOR = "#5865F2";

const CONTAINER_TEXT =
  "## <:hashtag:1570940895115616276> Canal nukado\neste canal foi recriado por {executor}\n-# recriado em {horario}";

const DEFAULTS = {
  mode: "container",
  containerText: CONTAINER_TEXT,
  text: CONTAINER_TEXT,
  embedTitle: "<:hashtag:1570940895115616276> Canal nukado",
  embedDescription: "este canal foi recriado por {executor}\n-# recriado em {horario}",
  embedFooter: "",
  color: "",
  thumbnail: "none",
  image: "",
};

const MODE_LABEL = { container: "Container (Components V2)", embed: "Embed", text: "Texto" };
const MODE_SHORT = { container: "Container", embed: "Embed", text: "Texto" };
const NEXT_MODE = { container: "embed", embed: "text", text: "container" };

// Variáveis que dá para usar em qualquer texto da mensagem
const VARIABLES = [
  ["{executor}", "marca quem usou o comando"],
  ["{executor_nome}", "nome de quem usou o comando"],
  ["{executor_id}", "ID de quem usou o comando"],
  ["{horario}", "data e hora completas (<t:…:F>)"],
  ["{horario_curto}", "data e hora curtas (<t:…:f>)"],
  ["{horario_relativo}", "tempo relativo, ex.: há 5 segundos (<t:…:R>)"],
  ["{hora}", "só a hora (<t:…:t>)"],
  ["{data}", "só a data (<t:…:D>)"],
  ["{canal}", "menção do canal novo"],
  ["{canal_nome}", "nome do canal"],
  ["{canal_antigo_id}", "ID do canal que foi apagado"],
  ["{categoria}", "nome da categoria do canal"],
  ["{servidor}", "nome do servidor"],
];

// Marcadores de layout (valem no modo Container; nos outros viram uma linha de texto)
const TOKENS = [
  ["[separador]", "linha separadora normal"],
  ["[separador_largo]", "linha separadora com mais espaço"],
  ["[espaco]", "espaço em branco, sem linha"],
];

module.exports = {
  DEFAULT_EMBED_COLOR,
  DEFAULTS,
  MODE_LABEL,
  MODE_SHORT,
  NEXT_MODE,
  VARIABLES,
  TOKENS,
};
