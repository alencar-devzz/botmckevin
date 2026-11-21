const BioPanelConfig = require("../../database/models/BioPanelConfig");
const { encrypt, decrypt } = require("./crypto");
const crypto = require("crypto");

const nanoid = () => crypto.randomBytes(4).toString("hex"); // 8 chars hex

// ---------- token ----------

async function getToken(guildId) {
  const doc = await BioPanelConfig.findOne({ guildId }).lean();
  if (!doc?.tokenEnc) return null;
  const plain = decrypt(doc.tokenEnc);
  return plain; // null se inválida
}

async function setToken(guildId, plainToken) {
  const tokenEnc = encrypt(plainToken.trim());
  await BioPanelConfig.findOneAndUpdate(
    { guildId },
    { $set: { tokenEnc } },
    { upsert: true, new: true }
  );
}

async function clearToken(guildId) {
  await BioPanelConfig.findOneAndUpdate({ guildId }, { $set: { tokenEnc: null } }, { upsert: true });
}

// Chamado quando a API retorna 401: apaga a token inválida
async function invalidateToken(guildId) {
  await clearToken(guildId);
}

// ---------- liga/desliga geral ----------

async function isEnabled(guildId) {
  const doc = await BioPanelConfig.findOne({ guildId }).select("enabled").lean();
  return doc?.enabled !== false;
}

async function setEnabled(guildId, enabled) {
  await BioPanelConfig.findOneAndUpdate({ guildId }, { $set: { enabled: Boolean(enabled) } }, { upsert: true });
}

// ---------- painéis ----------

async function getDoc(guildId) {
  let doc = await BioPanelConfig.findOne({ guildId });
  if (!doc) doc = await BioPanelConfig.create({ guildId });
  return doc;
}

async function getPanels(guildId) {
  const doc = await BioPanelConfig.findOne({ guildId }).lean();
  return doc?.panels ?? [];
}

async function getPanel(guildId, panelId) {
  const doc = await BioPanelConfig.findOne({ guildId }).lean();
  return doc?.panels?.find((p) => p.panelId === panelId) ?? null;
}

async function createPanel(guildId) {
  const panelId = nanoid();
  await BioPanelConfig.findOneAndUpdate(
    { guildId },
    { $push: { panels: { panelId } } },
    { upsert: true }
  );
  return panelId;
}

async function updatePanel(guildId, panelId, patch) {
  const setObj = {};
  for (const [k, v] of Object.entries(patch)) {
    setObj[`panels.$.${k}`] = v;
  }
  await BioPanelConfig.findOneAndUpdate(
    { guildId, "panels.panelId": panelId },
    { $set: setObj }
  );
}

async function deletePanel(guildId, panelId) {
  await BioPanelConfig.findOneAndUpdate(
    { guildId },
    { $pull: { panels: { panelId } } }
  );
}

// Marca o membro como verificado no painel (sem duplicar)
async function markVerified(guildId, panelId, userId) {
  await BioPanelConfig.updateOne(
    { guildId, "panels.panelId": panelId },
    { $addToSet: { "panels.$.verifiedUsers": userId } }
  );
}

module.exports = {
  markVerified,
  getToken, setToken, clearToken, invalidateToken,
  isEnabled, setEnabled,
  getPanels, getPanel, createPanel, updatePanel, deletePanel, getDoc,
};
