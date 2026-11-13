// Contadores extras do comando metricas (limites de requisição, quedas do gateway e erros do cliente).
const { track } = require("../utils/metrics");

module.exports = [
  {
    name: "clientReady",
    once: true,
    execute(client) {
      client.rest.on("rateLimited", () => track("limites"));
    },
  },
  { name: "shardDisconnect", execute: () => track("quedas") },
  { name: "shardError", execute: () => track("erros") },
  { name: "error", execute: () => track("erros") },
];
