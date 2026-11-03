const TicketRecord = require("../database/models/TicketRecord");

// Tickets abertos de um usuário em um painel. Remove os que não existem mais.
async function getOpenTickets(client, guildId, panelId, userId) {
  const records = await TicketRecord.find({ guildId, panelId, userId }).lean();
  const alive = [];

  for (const record of records) {
    const thread = await client.channels.fetch(record.threadId).catch(() => null);
    if (thread && !thread.archived) alive.push(record);
    else await TicketRecord.deleteOne({ _id: record._id });
  }
  return alive;
}

const createRecord = (data) => TicketRecord.create(data);
const findRecord = (threadId) => TicketRecord.findOne({ threadId }).lean();
const setClaimed = (threadId, userId) => TicketRecord.updateOne({ threadId }, { claimedBy: userId });
const deleteRecord = (threadId) => TicketRecord.deleteOne({ threadId });
const deleteRecordsByPanel = (panelId) => TicketRecord.deleteMany({ panelId });
const countOpen = (guildId, panelId = null) =>
  TicketRecord.countDocuments(panelId ? { guildId, panelId } : { guildId });

module.exports = {
  getOpenTickets,
  createRecord,
  findRecord,
  setClaimed,
  deleteRecord,
  deleteRecordsByPanel,
  countOpen,
};
