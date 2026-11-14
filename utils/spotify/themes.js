// Visual do card: valores padrão e temas prontos (o select "Temas" da tela Aparência).
// Aplicar um tema troca TODO o visual (cores, formato e vidro) de uma vez; textos, ícones e botões não mudam.

const VISUAL_DEFAULTS = {
  barColor: "green",
  barHex: "",
  trackHex: "",
  knobHex: "",
  titleHex: "",
  artistHex: "",
  timeHex: "",
  pillTextHex: "",
  footerTextHex: "",
  bgHex: "",
  bgHex2: "",
  shadeHex: "",
  glassHex: "",
  containerHex: "",
  glass: "normal",
  radius: 34,
  blur: 22,
  barHeight: 7,
  overlay: null,
  showTimes: true,
  showKnob: true,
};

const COLOR_FIELDS = [
  "barHex", "trackHex", "knobHex", "titleHex", "artistHex", "timeHex", "pillTextHex",
  "footerTextHex", "bgHex", "bgHex2", "shadeHex", "glassHex", "containerHex",
];
const SHAPE_FIELDS = ["radius", "blur", "barHeight", "overlay", "showTimes", "showKnob"];

const THEMES = {
  spotify: { label: "Spotify (padrão)", description: "Verde do Spotify, capa de fundo.", patch: {} },
  cover: { label: "Cor da capa", description: "Barra com a cor mais viva da capa.", patch: { barColor: "cover" } },
  neon: {
    label: "Neon roxo",
    description: "Barra roxa e vidro escuro arroxeado.",
    patch: {
      barColor: "custom", barHex: "#b44cff", trackHex: "#4b2a73", artistHex: "#e0c3ff",
      glass: "dark", glassHex: "#12002a", shadeHex: "#0b0016",
    },
  },
  pink: {
    label: "Rosa",
    description: "Barra rosa e vidro avermelhado.",
    patch: { barColor: "custom", barHex: "#ff5fa2", artistHex: "#ffd1e4", glassHex: "#2a0a1a", shadeHex: "#1a0510" },
  },
  ocean: {
    label: "Oceano",
    description: "Barra azul-clara e vidro azulado.",
    patch: { barColor: "custom", barHex: "#38bdf8", artistHex: "#bae6fd", glassHex: "#04182a", shadeHex: "#020c18" },
  },
  amber: {
    label: "Âmbar",
    description: "Barra dourada e vidro quente.",
    patch: { barColor: "custom", barHex: "#fbbf24", artistHex: "#fde68a", glassHex: "#2a1a04", shadeHex: "#180e02" },
  },
  minimal: {
    label: "Minimal (fundo liso)",
    description: "Sem capa: fundo grafite, barra branca e cantos retos.",
    patch: {
      barColor: "custom", barHex: "#ffffff", trackHex: "#3a3a3a", bgHex: "#161616", bgHex2: "#262626",
      glass: "normal", radius: 18, barHeight: 5,
    },
  },
};

// Quantos itens do visual estão diferentes do padrão
function visualCustomCount(cfg) {
  return Object.entries(VISUAL_DEFAULTS).filter(([key, value]) => cfg[key] !== value).length;
}

module.exports = { VISUAL_DEFAULTS, COLOR_FIELDS, SHAPE_FIELDS, THEMES, visualCustomCount };
