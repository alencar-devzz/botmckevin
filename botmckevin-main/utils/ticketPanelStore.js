const mongoose = require("mongoose");
const TicketPanel = require("../database/models/TicketPanel");
const TicketConfig = require("../database/models/TicketConfig");
const {
  PANEL_IMAGE,
  resolvePanel,
  defaultOptions,
} = require("./ticketSettings");

const migrations = new Map(); // guildId -> Promise (evita migrar duas vezes ao mesmo tempo)

// Converte a configuração antiga (uma só por servidor) no primeiro painel
async function migrateLegacy(guildId) {
  if (await TicketPanel.exists({ guildId })) return;
  const legacy = await TicketConfig.findOne({ guildId }).lean();
  if (!legacy) return;

  await TicketPanel.create({
    guildId,
    name: "Painel principal",
    mode: "select",
    title: legacy.panelTitle ?? null,
    description: legacy.panelDescription ?? null,
    placeholder: legacy.panelPlaceholder ?? null,
    panelImages: legacy.panelImages?.length ? legacy.panelImages : [PANEL_IMAGE],
    internalHeading: legacy.internalHeading ?? null,
    internalMessage: legacy.internalMessage ?? null,
    claimedMessage: legacy.claimedMessage ?? null,
    threadName: legacy.threadName ?? null,
    internalImages: legacy.internalImages,
    options: legacy.options?.length ? legacy.options : defaultOptions(),
    attendRoles: legacy.attendRoles,
    mentionRoles: legacy.mentionRoles,
    sent: legacy.panels ?? [],
  });
  await TicketConfig.deleteOne({ guildId });
}

function ensureMigrated(guildId) {
  if (!migrations.has(guildId)) {
    migrations.set(
      guildId,
      migrateLegacy(guildId)
        .catch((err) => console.error("[TICKET] Erro ao migrar a configuração antiga:", err))
        .finally(() => migrations.delete(guildId))
    );
  }
  return migrations.get(guildId);
}

async function listPanels(guildId) {
  await ensureMigrated(guildId);
  const docs = await TicketPanel.find({ guildId }).sort({ createdAt: 1 }).lean();
  return docs.map(resolvePanel);
}

async function getPanel(id) {
  if (!mongoose.isValidObjectId(id)) return null;
  const doc = await TicketPanel.findById(id).lean();
  return doc ? resolvePanel(doc) : null;
}

async function createPanel(guildId, data) {
  const doc = await TicketPanel.create({ guildId, ...data });
  return resolvePanel(doc.toObject());
}

// set: campos para salvar | unset: campos para voltar ao padrão
async function updatePanel(id, set = {}, unset = []) {
  const update = {};
  if (Object.keys(set).length) update.$set = set;
  if (unset.length) update.$unset = Object.fromEntries(unset.map((k) => [k, ""]));
  if (!Object.keys(update).length) return getPanel(id);

  const doc = await TicketPanel.findByIdAndUpdate(id, update, { new: true }).lean();
  return doc ? resolvePanel(doc) : null;
}

async function deletePanelDoc(id) {
  await TicketPanel.deleteOne({ _id: id });
}

// Painel que contém essa mensagem (para painéis antigos, cujo botão não tem o id do painel)
async function findPanelByMessage(guildId, messageId) {
  await ensureMigrated(guildId);
  const doc = await TicketPanel.findOne({ guildId, "sent.messageId": messageId }).lean();
  return doc ? resolvePanel(doc) : null;
}

module.exports = {
  listPanels,
  getPanel,
  createPanel,
  updatePanel,
  deletePanelDoc,
  findPanelByMessage,
};
