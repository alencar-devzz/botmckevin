const http = require("node:http");

let server = null;
let wasReady = false;

// Servidor HTTP mínimo para o health check da Render e os pings do UptimeRobot.
//
// Responde 503 até o bot ficar online pela primeira vez. Assim, num deploy/reinício, a Render só
// troca para a nova instância (e desliga a antiga) quando o bot já está conectado no Discord.
// Depois da primeira vez, responde sempre 200: uma reconexão rápida do gateway não deve fazer a
// Render achar que o serviço está doente e reiniciá-lo.
function startKeepAliveServer(client) {
  const port = process.env.PORT || 3000;

  server = http.createServer((req, res) => {
    if (client.isReady()) wasReady = true;

    if (!wasReady) {
      res.writeHead(503, { "Content-Type": "text/plain" });
      res.end("Bot iniciando...");
      return;
    }

    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(client.isReady() ? `Bot online como ${client.user.tag}` : "Bot reconectando...");
  });

  server.listen(port, () => {
    console.log(`[KEEPALIVE] Servidor HTTP ouvindo na porta ${port}`);
  });
}

function stopKeepAliveServer() {
  return new Promise((resolve) => {
    if (!server) return resolve();
    server.close(() => resolve());
    server.closeAllConnections?.();
  });
}

module.exports = { startKeepAliveServer, stopKeepAliveServer };
