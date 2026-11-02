const TicketConfig = require("../database/models/TicketConfig");
const { STAFF_ROLE_IDS, PANEL_IMAGE, TICKET_OPTIONS } = require("./ticketConfig");

const MAX_IMAGES = 5;
const MAX_OPTIONS = 25;

const DEFAULTS = {
  panelPlaceholder: "Selecione uma opção",
  internalHeading: "Ticket - {username}",
  internalMessage: "Por favor, aguarde as instruções do staff responsável.",
  claimedMessage: "{staff} **Assumiu** este ticket e irá lhe atender.",
  threadName: "📌・{username}・N°{number}",
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

// Junta o que está salvo no MongoDB com os padrões
function resolve(doc) {
  const d = doc ?? {};
  return {
    panelTitle: d.panelTitle || null,
    panelDescription: d.panelDescription || null,
    panelPlaceholder: d.panelPlaceholder || DEFAULTS.panelPlaceholder,
    panelImages: d.panelImages?.length ? [...d.panelImages] : [PANEL_IMAGE],
    panelSources: d.panelImages?.length ? [...d.panelImages] : [], // só o que o usuário definiu

    internalHeading: d.internalHeading || DEFAULTS.internalHeading,
    internalMessage: d.internalMessage || DEFAULTS.internalMessage,
    claimedMessage: d.claimedMessage || DEFAULTS.claimedMessage,
    threadName: d.threadName || DEFAULTS.threadName,
    internalImages: d.internalImages ? [...d.internalImages] : [],
    internalSources: d.internalImages ? [...d.internalImages] : [],

    options: d.options?.length
      ? d.options.map((o) => ({
          key: o.key,
          label: o.label,
          description: o.description || null,
          title: o.title,
          message: o.message || null,
        }))
      : defaultOptions(),

    attendRoles: d.attendRoles != null ? [...d.attendRoles] : [...STAFF_ROLE_IDS],
    mentionRoles: d.mentionRoles != null ? [...d.mentionRoles] : [...STAFF_ROLE_IDS],

    panels: (d.panels ?? []).map((p) => ({ channelId: p.channelId, messageId: p.messageId })),

    // Para o painel de configuração saber o que é personalizado e o que é padrão
    custom: {
      panelImages: Boolean(d.panelImages?.length),
      options: Boolean(d.options?.length),
      attendRoles: d.attendRoles != null,
      mentionRoles: d.mentionRoles != null,
    },
  };
}

async function getTicketSettings(guildId) {
  const doc = await TicketConfig.findOne({ guildId }).lean();
  return resolve(doc);
}

// set: campos para salvar | unset: campos para voltar ao padrão
async function updateTicketConfig(guildId, set = {}, unset = []) {
  const update = {};
  if (Object.keys(set).length) update.$set = set;
  if (unset.length) update.$unset = Object.fromEntries(unset.map((k) => [k, ""]));

  const doc = await TicketConfig.findOneAndUpdate({ guildId }, update, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  }).lean();
  return resolve(doc);
}

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
function getOption(settings, key) {
  return (
    settings.options.find((o) => o.key === key) ?? {
      key,
      label: String(key),
      description: null,
      title: String(key).toUpperCase(),
      message: null,
    }
  );
}

module.exports = {
  MAX_IMAGES,
  MAX_OPTIONS,
  DEFAULTS,
  getTicketSettings,
  updateTicketConfig,
  applyVars,
  parseImageUrls,
  getOption,
};
