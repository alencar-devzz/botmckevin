// Padrões e opções do /sorteio.

const LIMITS = {
  blocks: 5,
  name: 60,
  prize: 100,
  text: 3800, // soma do texto dos blocos (limite do Discord para Components V2)
  dm: 1800,
  components: 40,
  maxDurationMs: 365 * 24 * 60 * 60 * 1000,
  minDurationMs: 60 * 1000,
};

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const WINNER_OPTIONS = [1, 2, 3, 4, 5, 8, 10, 15, 20, 25, 50];

const DURATION_OPTIONS = [
  { label: "15 minutos", ms: 15 * MIN },
  { label: "30 minutos", ms: 30 * MIN },
  { label: "1 hora", ms: HOUR },
  { label: "6 horas", ms: 6 * HOUR },
  { label: "12 horas", ms: 12 * HOUR },
  { label: "1 dia", ms: DAY },
  { label: "2 dias", ms: 2 * DAY },
  { label: "3 dias", ms: 3 * DAY },
  { label: "7 dias", ms: 7 * DAY },
  { label: "14 dias", ms: 14 * DAY },
  { label: "30 dias", ms: 30 * DAY },
];

const CALL_OPTIONS = [0, 10, 30, 60, 120, 300, 600, 1200, 3000];
const MESSAGE_OPTIONS = [0, 10, 25, 50, 100, 250, 500, 1000, 2500];
const INVITE_OPTIONS = [0, 1, 2, 3, 5, 10, 15, 25, 50];
const EXTRA_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10];

const STATUS = { draft: "Rascunho", active: "Em andamento", ended: "Encerrado" };

const LAYOUTS = {
  container: { label: "Container", desc: "Caixa com barra de cor" },
  loose: { label: "Solto", desc: "Sem caixa, direto na conversa" },
};

const PLACES = {
  inside: { label: "Dentro do container", desc: "Botões no fim da caixa" },
  below: { label: "Abaixo do container", desc: "Botões soltos, depois da caixa" },
};

const BUTTON_COLORS = {
  primary: "Azul",
  secondary: "Cinza",
  success: "Verde",
  danger: "Vermelho",
};

const WHERE = {
  status: { label: "Status personalizado", desc: "Procura os padrões no status da pessoa" },
  tag: { label: "Tag do servidor", desc: "Exige a tag deste servidor no perfil" },
};

// Texto inicial do primeiro bloco. Variáveis: {premio} {participantes} {termino} {numero_de_ganhadores}
// {responsavel} {regras} {resultado}. [separador] e [separador_largo] viram linhas de divisão.
const DEFAULT_TEXT = [
  "## {premio}",
  "-# Sorteio aberto, encerra {termino}",
  "[separador]",
  "**Vencedores**  {numero_de_ganhadores}",
  "**Inscritos**  {participantes}",
  "**Organização**  {responsavel}",
  "[separador]",
  "Toque no botão abaixo para entrar na disputa.",
  "{regras}",
  "{resultado}",
].join("\n");

const DEFAULT_DM = [
  "Parabéns, {ganhador}. Você levou **{premio}** no sorteio **{sorteio}** de **{servidor}**.",
  "",
  "Fale com {responsavel} para combinar a entrega.",
  "{link}",
].join("\n");

const DEFAULT_MAIN_LABEL = "Entrar no sorteio";
const DEFAULT_PART_LABEL = "Inscritos: {participantes}";

const VARIABLES = [
  ["{premio}", "o prêmio"],
  ["{participantes}", "total de inscritos"],
  ["{termino}", "quando encerra"],
  ["{numero_de_ganhadores}", "quantos vencem"],
  ["{responsavel}", "quem organiza"],
  ["{regras}", "requisitos e chances extras"],
  ["{resultado}", "vencedores, ao terminar"],
];

module.exports = {
  LIMITS,
  MIN,
  HOUR,
  DAY,
  WINNER_OPTIONS,
  DURATION_OPTIONS,
  CALL_OPTIONS,
  MESSAGE_OPTIONS,
  INVITE_OPTIONS,
  EXTRA_OPTIONS,
  STATUS,
  LAYOUTS,
  PLACES,
  BUTTON_COLORS,
  WHERE,
  DEFAULT_TEXT,
  DEFAULT_DM,
  DEFAULT_MAIN_LABEL,
  DEFAULT_PART_LABEL,
  VARIABLES,
};
