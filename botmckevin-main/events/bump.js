// Bump Reminder: detecta o /bump do DISBOARD (ou outro bot configurado), agradece e agenda o próximo lembrete.
// Configuração: n!menu > Moderação > Bump reminder.
const { getBumpConfig } = require("../utils/bump/store");
const { initBump, registerBump } = require("../utils/bump/engine");

// O DISBOARD primeiro responde "pensando..." e depois EDITA a mensagem com o resultado,
// então olhamos tanto a criação quanto a edição. Cada mensagem só conta uma vez.
const seen = new Map(); // messageId -> timestamp
const SEEN_TTL = 10 * 60_000;

function alreadySeen(id) {
  const now = Date.now();
  for (const [key, at] of seen) if (now - at > SEEN_TTL) seen.delete(key);
  if (seen.has(id)) return true;
  seen.set(id, now);
  return false;
}

// Respostas de "espere mais um pouco" (bump em cooldown) nunca contam como bump
const WAIT_PATTERN =
  /(wait|aguard|espere|esper[ae]\b|attend|warte|minutes?\b|minutos?\b|hours?\b|horas?\b|cooldown|try again|tente novamente|too soon|ainda não)/i;

function messageText(message) {
  const parts = [message.content];
  for (const embed of message.embeds ?? []) {
    parts.push(embed.title, embed.description, embed.footer?.text);
    for (const field of embed.fields ?? []) parts.push(field.name, field.value);
  }
  return parts.filter(Boolean).join("\n").toLowerCase();
}

function isBumpSuccess(message, cfg) {
  const text = messageText(message);
  if (!text) return false; // "pensando..." ou mensagem vazia

  if (cfg.successKeywords.some((word) => text.includes(word))) return true;
  if (WAIT_PATTERN.test(text)) return false;

  // O DISBOARD manda a imagem do bump só quando deu certo
  return (message.embeds ?? []).some((e) => /bump/i.test(e.image?.url ?? ""));
}

async function inspect(message) {
  if (message.partial) {
    message = await message.fetch().catch(() => null);
    if (!message) return;
  }
  if (!message.guild || !message.author?.bot) return;

  // Só respostas de slash commands têm quem executou
  const user = message.interactionMetadata?.user ?? message.interaction?.user;
  if (!user) return;

  const cfg = await getBumpConfig(message.guild.id);
  if (!cfg.enabled || message.author.id !== cfg.bumpBotId) return;

  const commandName = message.interaction?.commandName?.split(" ")[0]?.toLowerCase();
  if (commandName && commandName !== cfg.commandName) return;

  if (!isBumpSuccess(message, cfg)) return;
  if (alreadySeen(message.id)) return;

  await registerBump(message.client, {
    guild: message.guild,
    channel: message.channel,
    user,
    at: new Date(message.createdTimestamp),
  });
}

const safe = (name, fn) => async (...args) => {
  try {
    await fn(...args);
  } catch (err) {
    console.error(`[BUMP] Erro em ${name}:`, err);
  }
};

module.exports = [
  {
    name: "messageCreate",
    execute: safe("messageCreate", (message) => inspect(message)),
  },
  {
    name: "messageUpdate",
    execute: safe("messageUpdate", (_old, message) => inspect(message)),
  },
  {
    name: "clientReady",
    once: true,
    execute: safe("clientReady", (client) => initBump(client)),
  },
];
