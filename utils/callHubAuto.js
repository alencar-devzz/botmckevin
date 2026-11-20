const { MessageFlags, ChannelType, PermissionFlagsBits } = require("discord.js");
const CallPanelState = require("../database/models/CallPanelState");
const { ALL_STAFF_ROLE_IDS } = require("./staffRoles");
const { getCallHubConfig } = require("./callHubStore");
const { say } = require("./callHubMessages");
const {
  humansIn,
  forgetOwner,
  getCallState,
  setPanelMessage,
  clearCallState,
  resetCall,
} = require("./callHub");
const { buildCallPanel } = require("../ui/callPanel");
const { activeCategory, deliver } = require("./logs/send");
const { COLORS, userBlock, channelBlock, code } = require("./logs/format");
const { isLocked } = require("./callHub");

// Comportamento automático do Gerenciador de calls.
// NADA aqui é fixo: tudo vem de n!menu → Comunidade e interação → Gerenciador de calls → Comportamento
// (painel automático, apagar painel, restaurar call, tempo vazia, intervalo entre ações, registro, etc.).

const V2 = MessageFlags.IsComponentsV2;

const emptyTimers = new Map(); // channelId -> timeout (call vazia esperando o tempo configurado)
const sending = new Set(); // channelId com envio de painel em andamento

// Calls onde o gerenciador age: voz comum, não ignorada, não é a sala de AFK
const isManaged = (cfg, channel) =>
  cfg.enabled &&
  channel.type === ChannelType.GuildVoice &&
  !cfg.ignoredChannels.includes(channel.id) &&
  channel.id !== channel.guild.afkChannelId;

// ======================= Painel automático =======================

async function fetchPanelMessage(channel, state) {
  if (!state?.panelMessageId) return null;
  return channel.messages.fetch(state.panelMessageId).catch(() => null);
}

async function sendPanel(channel, cfg) {
  if (sending.has(channel.id)) return;
  sending.add(channel.id);
  try {
    // Já existe um painel vivo nesta call: não manda outro
    const state = await getCallState(channel.id);
    if (await fetchPanelMessage(channel, state)) return;

    const message = await channel.send({
      components: buildCallPanel(cfg, channel.guild),
      flags: V2,
      allowedMentions: { parse: [] },
    });
    await setPanelMessage(channel, message.id);
  } catch (err) {
    console.error(`[CALLS] Não consegui enviar o painel automático em ${channel.id}:`, err.message);
  } finally {
    sending.delete(channel.id);
  }
}

async function deletePanel(channel, state) {
  const message = await fetchPanelMessage(channel, state);
  if (message) await message.delete().catch(() => {});
  await clearCallState(channel.id, ["panelMessageId"]);
}

// ======================= Call esvaziou =======================

// Aplica o que o servidor configurou para call vazia (apagar painel e/ou restaurar a call)
async function runEmpty(channel, guildId) {
  const cfg = await getCallHubConfig(guildId);
  const state = await getCallState(channel.id);

  if (cfg.autoPanelClean && state?.panelMessageId) await deletePanel(channel, state);

  if (cfg.resetOnEmpty && state?.touched) {
    const changed = await resetCall(channel).catch((err) => {
      console.error("[CALLS] Erro ao restaurar a call vazia:", err.message);
      return false;
    });
    await clearCallState(channel.id, ["touched"]);
    if (changed) await logAction(channel.guild, cfg, { actor: null, key: "reset", channel });
  }
}

function cancelEmptyTimer(channelId) {
  const timer = emptyTimers.get(channelId);
  if (timer) clearTimeout(timer);
  emptyTimers.delete(channelId);
}

async function onEmpty(channel, cfg) {
  cancelEmptyTimer(channel.id);
  forgetOwner(channel.id);

  const run = async () => {
    emptyTimers.delete(channel.id);
    const fresh = channel.guild.channels.cache.get(channel.id);
    if (!fresh || humansIn(fresh).size > 0) return; // alguém voltou durante a espera
    await runEmpty(fresh, channel.guild.id);
  };

  if (!cfg.emptyDelay) return run();
  emptyTimers.set(
    channel.id,
    setTimeout(() => run().catch((err) => console.error("[CALLS] Erro ao limpar a call vazia:", err.message)), cfg.emptyDelay * 1000)
  );
}

// ======================= Evento de voz =======================

async function handleVoiceUpdate(oldState, newState) {
  if (oldState.channelId === newState.channelId) return; // mutou, ligou câmera etc.
  if (newState.member?.user?.bot || oldState.member?.user?.bot) return;

  const guild = newState.guild ?? oldState.guild;
  const cfg = await getCallHubConfig(guild.id);

  // Saiu de uma call
  const left = oldState.channel;
  if (left && isManaged(cfg, left) && humansIn(left).size === 0) await onEmpty(left, cfg);

  // Entrou em uma call
  const joined = newState.channel;
  if (joined && isManaged(cfg, joined)) {
    cancelEmptyTimer(joined.id);
    if (cfg.autoPanel) await sendPanel(joined, cfg);
  }
}

// Ao ligar o bot: calls que esvaziaram enquanto ele estava off (painel esquecido, call sem restaurar)
async function sweepAutoPanels(client) {
  const docs = await CallPanelState.find({}).lean();
  for (const doc of docs) {
    const guild = client.guilds.cache.get(doc.guildId);
    const channel = guild?.channels.cache.get(doc.channelId);
    if (!channel) {
      await clearCallState(doc.channelId);
      continue;
    }
    if (humansIn(channel).size === 0) await runEmpty(channel, doc.guildId).catch(() => {});
  }
}

// ======================= Intervalo entre ações =======================

const lastUse = new Map(); // guildId:userId -> timestamp

// Moderação (Administrador, cargos da equipe e cargos de moderação das calls) não espera
const isModerator = (cfg, member) =>
  member.permissions.has(PermissionFlagsBits.Administrator) ||
  member.roles.cache.hasAny(...ALL_STAFF_ROLE_IDS) ||
  (cfg.staffRoles.length > 0 && member.roles.cache.hasAny(...cfg.staffRoles));

// Segundos que ainda faltam esperar (0 = pode usar). Se pode usar, já começa a contar o próximo intervalo.
function checkCooldown(cfg, member) {
  if (!cfg.cooldown || isModerator(cfg, member)) return 0;
  const key = `${member.guild.id}:${member.id}`;
  const left = Math.ceil(((lastUse.get(key) ?? 0) + cfg.cooldown * 1000 - Date.now()) / 1000);
  if (left > 0) return left;
  lastUse.set(key, Date.now());
  return 0;
}

// ======================= Registro das ações =======================

// Mesmo estilo dos outros logs (utils/logs): título, cores (verde = bom, vermelho = ruim, branco = banal),
// miniatura de quem fez, blocos com as informações e data/hora no fim.
// Vai para o canal da categoria "Painel de calls" em n!menu → Logs e registros
// (se ela não tiver canal, usa o canal de registro de Comportamento).
const LOG_ACTIONS = {
  lock: ["Privou a call", "white"],
  unlock: ["Tornou a call pública", "green"],
  limit: ["Alterou o limite", "white"],
  add: ["Liberou a entrada", "green"],
  remove: ["Tirou a permissão de entrada", "red"],
  kick: ["Desconectou", "red"],
  move: ["Moveu para a call", "white"],
  transfer: ["Transferiu a posse", "white"],
  blacklist: ["Blacklist", "red"],
  save: ["Salvou a configuração", "white"],
  load: ["Usou a configuração salva", "white"],
  reset: ["Call restaurada", "white"],
};

// actor = GuildMember (ou null quando foi automático) · targets = ids afetados · lines = linhas extras do 3º bloco
// tone = força a cor (ex.: blacklist que libera vira verde)
async function logAction(guild, cfg, { actor, key, channel, targets = [], lines = [], tone = null, title = null }) {
  try {
    let dest = await activeCategory(guild, "painelcalls", Boolean(actor?.user?.bot));
    if (!dest && cfg.logChannelId) dest = { channelId: cfg.logChannelId };
    if (!dest) return;

    const [label, baseTone] = LOG_ACTIONS[key] ?? [key, "white"];
    const inCall = [...channel.members.values()].filter((m) => !m.user.bot);
    const people = inCall.length ? inCall.map((m) => `<@${m.id}>`).join(" ") : code("ninguém");

    const groups = [
      actor ? [userBlock(actor.user, "Usuário")] : ["**Executado por:** `Sistema` (automático)"],
      [
        channelBlock(channel, "Call"),
        `**Acesso:** ${code(isLocked(channel) ? "privada" : "pública")} · **Limite:** ${code(channel.userLimit ? channel.userLimit : "sem limite")}`,
        `**Na call (${inCall.length}):** ${people}`,
      ],
    ];

    const unique = [...new Set(targets)];
    const extra = [unique.length ? `**Pessoas afetadas (${unique.length}):** ${unique.map((id) => `<@${id}>`).join(" ")}` : null, ...lines].filter(Boolean);
    if (extra.length) groups.push(extra);

    await deliver(guild, dest, {
      title: `Painel de calls — ${title ?? label} — ${guild.name}`,
      color: COLORS[tone ?? baseTone],
      thumbnail: actor?.displayAvatarURL?.(),
      groups,
    });
  } catch (err) {
    console.error("[CALLS] Não consegui registrar a ação do painel:", err.message);
  }
}

module.exports = {
  handleVoiceUpdate,
  sweepAutoPanels,
  cancelEmptyTimer,
  checkCooldown,
  logAction,
};
