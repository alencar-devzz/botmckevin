const { TextInputStyle } = require("discord.js");
const { textLabel, selectLabel, modal } = require("./modalHelpers");
const { buildImagesModal } = require("./ticketConfigModals");
const { COLOR_PRESETS, colorToHex, MAX_IMAGES } = require("../utils/ticketSettings");
const { FIELDS, DEFAULTS, THUMB_LABELS, isUrl } = require("../utils/portariaSettings");
const { describeSources } = require("../utils/ticketMedia");

const TITLES = {
  welcome: "Textos de boas-vindas",
  leave: "Textos de saída",
  dm: "Textos da DM",
};

// Só mostra no campo o que o dono escreveu (padrão aparece como dica cinza)
const custom = (value) => (value == null || value === "" ? null : value);

// kind: "welcome" | "leave" | "dm"
function buildTextModal(kind, config) {
  const f = FIELDS[kind];
  const defaults = DEFAULTS[kind];

  return modal(
    `port_modal:msg:${kind}`,
    TITLES[kind],
    textLabel({
      id: "title",
      label: "Título (opcional)",
      description: "Escreva do jeito que quiser (ex: ### Título). Vazio = padrão.",
      max: 200,
      value: custom(config[f.title]),
      placeholder: defaults.title,
    }),
    textLabel({
      id: "message",
      label: "Mensagem",
      description: "Aceita variáveis, {separador}, {imagem} etc. (lista no painel).",
      style: TextInputStyle.Paragraph,
      max: 2500,
      value: custom(config[f.message]),
      placeholder: defaults.message,
    }),
    textLabel({
      id: "footer",
      label: "Rodapé (opcional)",
      description: "Texto pequeno no fim. Também aceita variáveis e marcadores.",
      style: TextInputStyle.Paragraph,
      max: 500,
      value: custom(config[f.footer]),
      placeholder: defaults.footer || "Ex: Leia as regras antes de começar",
    }),
    selectLabel({
      id: "blank",
      label: "Não usar texto padrão",
      description: "Marque o que deve ficar SEM texto. Só vale para campos deixados vazios.",
      min: 0,
      max: 3,
      required: false,
      options: [
        { label: "Título", value: "title", default: config[f.title] === "" },
        { label: "Rodapé", value: "footer", default: config[f.footer] === "" },
        { label: "Mensagem", value: "message", default: config[f.message] === "" },
      ],
    })
  );
}

function buildColorModal(kind, config) {
  const color = config[FIELDS[kind].color] ?? null;
  const current = Object.entries(COLOR_PRESETS).find(([, c]) => c.value === color)?.[0];

  return modal(
    `port_modal:color:${kind}`,
    "Cor da mensagem",
    selectLabel({
      id: "preset",
      label: "Cor predefinida",
      description: "Cor da barra lateral da mensagem (formato Container).",
      options: Object.entries(COLOR_PRESETS).map(([value, c]) => ({
        label: c.label,
        value,
        default: value === (current ?? (color == null ? "none" : null)),
      })),
    }),
    textLabel({
      id: "hex",
      label: "Cor personalizada (opcional)",
      description: "Se preencher, vale no lugar da predefinida. Formato #RRGGBB.",
      max: 7,
      value: current || color == null ? null : colorToHex(color),
      placeholder: "#ff00aa",
    })
  );
}

async function buildImagesModalFor(kind, config) {
  const sources = config[FIELDS[kind].images] ?? [];
  return buildImagesModal({
    customId: `port_modal:img:${kind}`,
    title: "Imagens da mensagem",
    current: sources.length ? await describeSources(sources) : [],
  });
}

function buildThumbModal(kind, config) {
  const thumb = config[FIELDS[kind].thumb] ?? (kind === "dm" ? "none" : "avatar");
  const link = isUrl(thumb);

  return modal(
    `port_modal:thumb:${kind}`,
    "Miniatura da mensagem",
    selectLabel({
      id: "thumb",
      label: "Imagem pequena ao lado do texto",
      description: "Só aparece no formato Container, ao lado do primeiro texto.",
      options: Object.entries(THUMB_LABELS).map(([value, label]) => ({
        label,
        value,
        default: !link && value === thumb,
      })),
    }),
    textLabel({
      id: "url",
      label: "Link de imagem personalizado (opcional)",
      description: "Se preencher, vale no lugar da opção acima.",
      max: 500,
      value: link ? thumb : null,
      placeholder: "https://exemplo.com/imagem.png",
    })
  );
}

function buildDelayModal(kind, current) {
  return modal(
    `port_modal:delay:${kind}`,
    "Apagar mensagem automaticamente",
    textLabel({
      id: "seconds",
      label: "Segundos até apagar",
      description: "Use 0 para não apagar. Máximo de 3600 (1 hora).",
      max: 4,
      required: true,
      value: String(current ?? 0),
      placeholder: "Ex: 30",
    })
  );
}

function buildAgeModal(current) {
  return modal(
    "port_modal:age",
    "Idade mínima da conta",
    textLabel({
      id: "days",
      label: "Dias de criação da conta",
      description: "Contas mais novas que isso serão expulsas. De 1 a 365.",
      max: 3,
      required: true,
      value: String(current ?? 7),
      placeholder: "Ex: 7",
    })
  );
}

module.exports = {
  MAX_IMAGES,
  buildTextModal,
  buildColorModal,
  buildImagesModalFor,
  buildThumbModal,
  buildDelayModal,
  buildAgeModal,
};
