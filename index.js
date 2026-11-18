require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { Client, GatewayIntentBits, Partials, Collection } = require("discord.js");
const mongoose = require("mongoose");
const { connectDatabase } = require("./database/connect");
const { startKeepAliveServer, stopKeepAliveServer } = require("./keepAlive");

// Um erro solto (ex.: o Mongo falhando num handler sem try/catch) não pode derrubar o processo:
// no Node 22 uma promessa rejeitada sem tratamento encerra o bot, e a Render reinicia tudo.
process.on("unhandledRejection", (reason) => {
  console.error("[PROCESSO] Promessa rejeitada sem tratamento:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[PROCESSO] Exceção não capturada:", err);
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration, // banimentos e registro de auditoria (logs)
    GatewayIntentBits.GuildPresences, // Rich Presence do Spotify (comando spotify); ligar em Privileged Gateway Intents
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions, // /sorteio: entrada por reação
    GatewayIntentBits.GuildInvites, // /sorteio: requisito de convites
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.Reaction, Partials.User],
  // Padrão do bot inteiro: menções aparecem como texto, mas ninguém é pingado.
  // Só envios que passam allowedMentions de propósito (ex.: ticket, sorteio, bump) sobrescrevem isso.
  allowedMentions: { parse: [], repliedUser: false },
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

// Só erros importantes aparecem nos logs da Render
client.on("error", (err) => console.error("[DISCORD] Erro:", err));
client.on("shardError", (err) => console.error("[DISCORD] Erro no gateway:", err));

// Desligamento limpo: a Render manda SIGTERM na instância antiga depois que a nova assume.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[SHUTDOWN] ${signal} recebido, desligando...`);
  const force = setTimeout(() => process.exit(0), 10000);
  force.unref();
  try {
    await stopKeepAliveServer();
    await client.destroy();
    await mongoose.disconnect();
  } catch (err) {
    console.error("[SHUTDOWN] Erro ao desligar:", err?.message ?? err);
  }
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

(async () => {
  // O login no Discord roda em paralelo com a conexão do MongoDB para o bot ficar online mais rápido.
  // Consultas feitas antes do banco conectar ficam na fila do mongoose (até 10s) e rodam em seguida.
  const database = connectDatabase(); // se falhar, ele mesmo encerra o processo

  try {
    await client.login((process.env.TOKEN ?? "").trim());
  } catch (err) {
    console.error("[LOGIN] Falha ao logar no Discord:", err);
  }

  await database;
})();
