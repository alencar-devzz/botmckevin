const { PANEL_IMAGE, STAFF_ROLE_IDS, TICKET_OPTIONS } = require("./ticketConfig");

const MAX_IMAGES = 5;
const MAX_OPTIONS = 25;
const MAX_PANELS = 15;

const DEFAULTS = {
  placeholder: "Selecione uma opção",
  buttonLabel: "Abrir ticket",
  description: "Precisa de ajuda? Abra um ticket e nossa equipe irá atender você.",
  internalHeading: "Ticket - {username}",
  internalMessage: "Por favor, aguarde as instruções do staff responsável.",
  claimedMessage: "{staff} **Assumiu** este ticket e irá lhe atender.",
  threadName: "{username}・N°{number}",
  maxPerUser: 1,
  archiveMinutes: 10080,
  successTitle: "Atendimento aberto com sucesso.",
  successMessage: "Painel: {panel}. Sua conversa com a equipe acontece no tópico privado.",
  successButtonLabel: "Ir para o ticket",
  limitTitle: "Você já tem um ticket aberto.",
  limitMessage: "Limite neste painel: {max} ticket(s) por pessoa. Finalize o atual antes de abrir outro.",
  closeConfirmTitle: "Finalizar este ticket?",
  closeConfirmMessage: "O tópico será excluído e a conversa não poderá ser recuperada.",
  closeConfirmButtonLabel: "Confirmar",
};

const BUTTON_STYLES = {
  primary: "Azul",
  secondary: "Cinza",
  success: "Verde",
  danger: "Vermelho",
};

// Cores da barra lateral do painel (null = sem cor)
const COLOR_PRESETS = {
  none: { label: "Sem cor", value: null },
  green: { label: "Verde", value: 0x00c853 },
  red: { label: "Vermelho", value: 0xe50000 },
  white: { label: "Branco", value: 0xffffff },
  blue: { label: "Azul", value: 0x2979ff },
  purple: { label: "Roxo", value: 0x9c27b0 },
  orange: { label: "Laranja", value: 0xff6d00 },
  yellow: { label: "Amarelo", value: 0xffd600 },
  pink: { label: "Rosa", value: 0xff4081 },
  gray: { label: "Cinza", value: 0x9e9e9e },
};

// Tempos válidos de arquivamento automático do Discord (em minutos)
const ARCHIVE_OPTIONS = {
  60: "1 hora",
  1440: "24 horas",
  4320: "3 dias",
  10080: "7 dias",
};

function defaultOptions() {
  return Object.entries(TICKET_OPTIONS).map(([key, o]) => ({
    key,
    label: o.label,
    description: o.description,
    title: o.title,
    message: null,
  }));
}

// "#ff00aa" ou "ff00aa" -> número. Inválido -> null
function parseHexColor(text) {
  const match = String(text ?? "").trim().match(/^#?([0-9a-f]{6})$/i);
  return match ? parseInt(match[1], 16) : null;
}

const colorToHex = (value) => (value == null ? null : `#${value.toString(16).padStart(6, "0")}`);

function colorName(value) {
  if (value == null) return "Sem cor";
  const preset = Object.values(COLOR_PRESETS).find((c) => c.value === value);
  return preset ? preset.label : colorToHex(value);
}

// Texto configurável: ausente (null/undefined) = usa o padrão; "" = o dono deixou SEM texto de propósito
const textOr = (value, fallback) => (value == null ? fallback : value);

// Junta o que está salvo no MongoDB com os padrões
function resolvePanel(doc) {
  const d = doc ?? {};
  const options = d.options?.length
    ? d.options.map((o) => ({
        key: o.key,
        label: o.label,
        description: o.description || null,
        title: o.title,
        message: o.message ?? null, // "" = sem texto (de propósito), null = usa a mensagem do painel
        staffRoles: o.staffRoles ? [...o.staffRoles] : null,
      }))
    : defaultOptions().map((o) => ({ ...o, staffRoles: null }));

  const panelImages = d.panelImages ? [...d.panelImages] : [];
  const internalImages = d.internalImages ? [...d.internalImages] : [];

  return {
    id: d._id ? String(d._id) : "removed",
    guildId: d.guildId ?? null,
    name: d.name || "Painel de tickets",
    mode: d.mode === "button" ? "button" : "select",
    enabled: d.enabled !== false,

    title: d.title || null,
    description: d.description || null,
    footer: d.footer || null,
    color: d.color ?? null,
    showInfo: d.showInfo !== false,
    panelImages,
    panelSources: panelImages, // fontes definidas pelo usuário (links ou "db:<id>")

    placeholder: textOr(d.placeholder, DEFAULTS.placeholder),
    buttonLabel: d.buttonLabel || DEFAULTS.buttonLabel,
    buttonStyle: BUTTON_STYLES[d.buttonStyle] ? d.buttonStyle : "primary",
    options,

    internalHeading: textOr(d.internalHeading, DEFAULTS.internalHeading),
    internalMessage: textOr(d.internalMessage, DEFAULTS.internalMessage),
    claimedMessage: textOr(d.claimedMessage, DEFAULTS.claimedMessage),
    threadName: d.threadName || DEFAULTS.threadName,
    internalImages,
    internalSources: internalImages,
    ticketChannelId: d.ticketChannelId || null,
    archiveMinutes: ARCHIVE_OPTIONS[d.archiveMinutes] ? d.archiveMinutes : DEFAULTS.archiveMinutes,
    showOptionLine: d.showOptionLine !== false,
    showTicketFooter: d.showTicketFooter !== false,

    attendRoles: d.attendRoles != null ? [...d.attendRoles] : [...STAFF_ROLE_IDS],
    mentionRoles: d.mentionRoles != null ? [...d.mentionRoles] : [...STAFF_ROLE_IDS],

    maxPerUser: d.maxPerUser ?? DEFAULTS.maxPerUser,
    askReason: Boolean(d.askReason),
    confirmClose: Boolean(d.confirmClose),

    // Mensagem efêmera de confirmação ao abrir o ticket
    successTitle: textOr(d.successTitle, DEFAULTS.successTitle),
    successMessage: textOr(d.successMessage, DEFAULTS.successMessage),
    successColor: d.successColor !== undefined ? d.successColor : null,
    successButtonLabel: d.successButtonLabel || DEFAULTS.successButtonLabel,
    successButtonEnabled: d.successButtonEnabled !== false,

    showAuthorLine: d.showAuthorLine !== false,
    internalColor: d.internalColor !== undefined ? d.internalColor : null,
    claimedColor: d.claimedColor !== undefined ? d.claimedColor : null,

    limitTitle: textOr(d.limitTitle, DEFAULTS.limitTitle),
    limitMessage: textOr(d.limitMessage, DEFAULTS.limitMessage),
    limitColor: d.limitColor !== undefined ? d.limitColor : null,

    closeConfirmTitle: textOr(d.closeConfirmTitle, DEFAULTS.closeConfirmTitle),
    closeConfirmMessage: textOr(d.closeConfirmMessage, DEFAULTS.closeConfirmMessage),
    closeConfirmButtonLabel: d.closeConfirmButtonLabel || DEFAULTS.closeConfirmButtonLabel,
    closeConfirmColor: d.closeConfirmColor !== undefined ? d.closeConfirmColor : null,

    sent: (d.sent ?? []).map((p) => ({ channelId: p.channelId, messageId: p.messageId })),

    custom: {
      attendRoles: d.attendRoles != null,
      mentionRoles: d.mentionRoles != null,
    },
  };
}

// Painel "genérico" para tickets cujo painel foi excluído (os botões continuam funcionando)
const fallbackPanel = (guildId) => resolvePanel({ guildId, name: "Painel removido" });

// Troca {variáveis} no texto. Variáveis desconhecidas ficam como estão.
function applyVars(text, vars) {
  return String(text).replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : match
  );
}

// Lê links de imagem (um por linha). Retorna os válidos e quantos foram ignorados.
function parseImageUrls(text) {
  const parts = String(text ?? "")
    .split(/\s+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const valid = [];
  let invalid = 0;
  for (const part of parts) {
    if (/^https?:\/\/\S+$/i.test(part)) {
      if (!valid.includes(part)) valid.push(part);
    } else {
      invalid++;
    }
  }
  const ignoredByLimit = Math.max(0, valid.length - MAX_IMAGES);
  return { urls: valid.slice(0, MAX_IMAGES), invalid: invalid + ignoredByLimit };
}

// Opção pelo key (tickets antigos podem apontar para uma opção que não existe mais)
function getOption(panel, key) {
  return (
    panel.options.find((o) => o.key === key) ?? {
      key,
      label: String(key),
      description: null,
      title: String(key).toUpperCase(),
      message: null,
      staffRoles: null,
    }
  );
}

// Gera um key único a partir do nome da opção
function makeOptionKey(label, existing) {
  const base =
    String(label)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 20) || "opcao";
  let key = base;
  let n = 2;
  while (existing.includes(key)) key = `${base}-${n++}`;
  return key;
}

module.exports = {
  PANEL_IMAGE,
  MAX_IMAGES,
  MAX_OPTIONS,
  MAX_PANELS,
  DEFAULTS,
  BUTTON_STYLES,
  COLOR_PRESETS,
  ARCHIVE_OPTIONS,
  defaultOptions,
  parseHexColor,
  colorToHex,
  colorName,
  resolvePanel,
  fallbackPanel,
  applyVars,
  parseImageUrls,
  getOption,
  makeOptionKey,
};
