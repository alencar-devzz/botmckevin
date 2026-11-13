const mongoose = require("mongoose");
const { connectLogsDatabase } = require("./logsConnection");

async function connectDatabase() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("[DATABASE] Conectado ao MongoDB com sucesso.");
    await connectLogsDatabase();
  } catch (err) {
    console.error("[DATABASE] Erro ao conectar no MongoDB:", err);
    process.exit(1);
  }
}

module.exports = { connectDatabase };
