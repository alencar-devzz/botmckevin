require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { Client, GatewayIntentBits, Partials, Collection } = require("discord.js");
const { connectDatabase } = require("./database/connect");
const { startKeepAliveServer } = require("./keepAlive");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration, // banimentos e registro de auditoria (logs)
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

client.commands = new Collection();

// Carrega comandos
const commandsPath = path.join(__dirname, "commands");
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith(".js"))) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.name, command);
  for (const alias of command.aliases ?? []) {
    client.commands.set(alias, command);
  }
}

// Carrega eventos
const eventsPath = path.join(__dirname, "events");
for (const file of fs.readdirSync(eventsPath).filter((f) => f.endsWith(".js"))) {
  const exported = require(path.join(eventsPath, file));
  // Um arquivo pode exportar um evento ou uma lista de eventos (ex: events/logs.js)
  for (const event of Array.isArray(exported) ? exported : [exported]) {
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }
  }
}

startKeepAliveServer(client);

// Diagnóstico de login: mostra nos logs da Render o que o Discord respondeu
client.on("error", (err) => console.error("[DISCORD] Erro:", err));
client.on("warn", (msg) => console.warn("[DISCORD] Aviso:", msg));
client.on("shardError", (err) => console.error("[DISCORD] Erro no gateway:", err));
client.rest.on("rateLimited", (info) =>
  console.warn(`[DISCORD] Rate limit em ${info.route}, espera de ${info.timeToReset}ms`)
);
client.on("debug", (msg) => {
  if (/Preparing to connect|Session Info|Sending a heartbeat|Heartbeat acknowledged|Provided token/i.test(msg) === false) {
    console.log("[DISCORD][debug]", msg.slice(0, 200));
  }
});

(async () => {
  await connectDatabase();

  const token = (process.env.TOKEN ?? "").trim();
  console.log(`[LOGIN] Token ${token ? `recebido (${token.length} caracteres)` : "VAZIO ou não definido"}`);

  // Se em 30s o bot não ficou pronto, avisa (login travado)
  setTimeout(() => {
    if (!client.isReady()) console.error("[LOGIN] 30s sem ficar online. Status do bot:", client.ws.status);
  }, 30_000);

  try {
    await client.login(token);
  } catch (err) {
    console.error("[LOGIN] Falha ao logar no Discord:", err);
  }
})();
