const TagPanelConfig = require("../../database/models/TagPanelConfig");
const crypto = require("crypto");

const nanoid = () => crypto.randomBytes(4).toString("hex"); // 8 chars hex

// ---------- liga/desliga geral ----------

async function isEnabled(guildId) {
  const doc = await TagPanelConfig.findOne({ guildId }).select("enabled").lean();
  return doc?.enabled !== false;
}

async function setEnabled(guildId, enabled) {
  await TagPanelConfig.findOneAndUpdate({ guildId }, { $set: { enabled: Boolean(enabled) } }, { upsert: true });
}

// ---------- painéis ----------

async function getDoc(guildId) {
  let doc = await TagPanelConfig.findOne({ guildId });
  if (!doc) doc = await TagPanelConfig.create({ guildId });
  return doc;
}

async function getPanels(guildId) {
  const doc = await TagPanelConfig.findOne({ guildId }).lean();
  return doc?.panels ?? [];
}

async function getPanel(guildId, panelId) {
  const doc = await TagPanelConfig.findOne({ guildId }).lean();
  return doc?.panels?.find((p) => p.panelId === panelId) ?? null;
}

async function createPanel(guildId) {
  const panelId = nanoid();
  await TagPanelConfig.findOneAndUpdate(
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
  await TagPanelConfig.findOneAndUpdate(
    { guildId, "panels.panelId": panelId },
    { $set: setObj }
  );
}

async function deletePanel(guildId, panelId) {
  await TagPanelConfig.findOneAndUpdate(
    { guildId },
    { $pull: { panels: { panelId } } }
  );
}

module.exports = {
  isEnabled, setEnabled,
  getPanels, getPanel, createPanel, updatePanel, deletePanel, getDoc,
};
