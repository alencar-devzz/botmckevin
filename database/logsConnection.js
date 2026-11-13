const mongoose = require("mongoose");

// Segundo banco de dados: usado SOMENTE pelo cache de mensagens do sistema de logs
// (mensagens editadas/excluídas). Todo o resto do bot continua no banco principal (MONGO_URI).
// Se MONGO_URI_LOGS não estiver definida, cai para o banco principal e tudo funciona como antes.
const uri = (process.env.MONGO_URI_LOGS ?? "").trim();
const isSeparate = Boolean(uri);

const logsConnection = isSeparate ? mongoose.createConnection(uri) : mongoose.connection;

// Evita que uma falha nesse banco derrube o processo (rejeição não tratada) antes de connectLogsDatabase rodar
if (isSeparate) {
  logsConnection.on("error", () => {});
  logsConnection.asPromise().catch(() => {});
}

async function connectLogsDatabase() {
  if (!isSeparate) {
    console.log("[DATABASE] MONGO_URI_LOGS não definida: logs de mensagens usarão o banco principal.");
    return;
  }
  try {
    await logsConnection.asPromise();
    console.log("[DATABASE] Banco de logs de mensagens conectado com sucesso.");
  } catch (err) {
    // O log não pode derrubar o bot: ele segue funcionando, só sem guardar/ler mensagens antigas.
    console.error("[DATABASE] Erro ao conectar no banco de logs (o bot continua sem ele):", err.message);
  }
}

module.exports = { logsConnection, connectLogsDatabase, isSeparate };
