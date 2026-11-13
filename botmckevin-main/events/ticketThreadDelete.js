const { deleteRecord } = require("../utils/ticketRecords");

// Quando um tópico de ticket é apagado (por qualquer motivo), remove o registro dele
module.exports = {
  name: "threadDelete",
  async execute(thread) {
    await deleteRecord(thread.id).catch(() => {});
  },
};
