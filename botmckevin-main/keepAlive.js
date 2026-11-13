const http = require("node:http");

// Servidor HTTP mínimo só para responder aos pings do UptimeRobot
// (necessário apenas se o serviço no Render for um Web Service gratuito,
// que "dorme" sem receber requisições HTTP por ~15 minutos).
function startKeepAliveServer(client) {
  const port = process.env.PORT || 3000;

  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(client.user ? `Bot online como ${client.user.tag}` : "Bot iniciando...");
  });

  server.listen(port, () => {
    console.log(`[KEEPALIVE] Servidor HTTP ouvindo na porta ${port}`);
  });
}

module.exports = { startKeepAliveServer };
