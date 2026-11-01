const { AuditLogEvent, MessageFlags } = require("discord.js");
const {
  joinVoiceChannel,
  getVoiceConnection,
  entersState,
  VoiceConnectionStatus,
} = require("@discordjs/voice");
const CallState = require("../database/models/CallState");
const { buildBotcallPanel } = require("../ui/botcall");

// Tempos (em ms). Exportado só para poder ajustar/testar.
const TIMINGS = {
  retryBase: 5_000, // 1ª espera entre tentativas (dobra a cada falha)
  retryMax: 60_000, // espera máxima entre tentativas (nunca desiste)
  readyTimeout: 20_000, // tempo máximo para a conexão ficar pronta
  recoverWindow: 5_000, // tempo que a lib tem para se recuperar sozinha
  watchdogInterval: 30_000, // verificação periódica
  stuckLimit: 60_000, // tempo máximo "conectando" antes de forçar nova conexão
  expectedWindow: 8_000, // janela em que uma saída causada pelo próprio bot é ignorada
  auditWaits: [1_500, 2_500], // esperas antes de olhar o registro de auditoria
  auditRecent: 15_000, // quão recente precisa ser uma desconexão no registro de auditoria
  restoreDelay: 2_000, // espera antes de reconectar ao iniciar
  panelDebounce: 1_000, // junta várias mudanças seguidas numa só atualização do painel
};

let client = null;
const desired = new Map(); // guildId -> channelId que o bot DEVE manter
const retries = new Map(); // guildId -> { timer, attempts }
const locks = new Map(); // guildId -> promise (uma operação de voz por vez)
const expectedLeaves = new Map(); // guildId -> timestamp da última saída "esperada"
const deciding = new Set(); // guildIds analisando se foi desconexão manual
const notReadySince = new Map();
const mismatches = new Map();
const auditCounts = new Map(); // entryId -> count (para detectar desconexões novas)
const lastChannels = new Map(); // guildId -> última call escolhida (mesmo desconectado)
const panels = new Map(); // guildId -> { channelId, messageId, signature } painel que é atualizado em tempo real
const panelTimers = new Map(); // guildId -> timer de atualização do painel

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- utilidades ----------

function getRetry(guildId) {
  if (!retries.has(guildId)) retries.set(guildId, { timer: null, attempts: 0 });
  return retries.get(guildId);
}

function clearRetry(guildId) {
  const state = retries.get(guildId);
  if (state?.timer) clearTimeout(state.timer);
  retries.delete(guildId);
}

function withLock(guildId, fn) {
  const previous = locks.get(guildId) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(fn);
  locks.set(guildId, next.catch(() => {}));
  return next;
}

function markExpectedLeave(guildId) {
  expectedLeaves.set(guildId, Date.now());
}

function isExpectedLeave(guildId) {
  const at = expectedLeaves.get(guildId);
  return at !== undefined && Date.now() - at < TIMINGS.expectedWindow;
}

// Destrói a conexão marcando antes que a saída foi causada pelo próprio bot
function destroyConnection(guildId) {
  const connection = getVoiceConnection(guildId);
  if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
    markExpectedLeave(guildId);
    connection.destroy();
  }
}

async function saveState(guildId, fields) {
  try {
    await CallState.findOneAndUpdate({ guildId }, { $set: fields }, { upsert: true });
  } catch (err) {
    console.error("[CALL] Erro ao salvar no MongoDB:", err.message);
  }
}

function isHealthy(guild, channelId) {
  const connection = getVoiceConnection(guild.id);
  return (
    connection?.state.status === VoiceConnectionStatus.Ready &&
    guild.members.me?.voice?.channelId === channelId
  );
}

// ---------- painel em tempo real ----------

const signatureOf = (state) => `${state.selectedId ?? ""}|${state.connected}`;

// Estado que o painel deve mostrar agora, baseado na situação real do bot
function computePanelState(guildId) {
  const guild = client?.guilds.cache.get(guildId);
  const selectedId = desired.get(guildId) ?? lastChannels.get(guildId) ?? null;
  const connected = Boolean(guild && selectedId && isHealthy(guild, selectedId));
  return { selectedId, connected };
}

async function refreshPanel(guildId) {
  const ref = panels.get(guildId);
  if (!ref || !client) return;

  const state = computePanelState(guildId);
  const signature = signatureOf(state);
  if (ref.signature === signature) return; // painel já está igual, não precisa editar

  let message = null;
  try {
    const channel = await client.channels.fetch(ref.channelId);
    message = await channel.messages.fetch(ref.messageId);
  } catch (err) {
    // Canal ou mensagem apagados: para de acompanhar esse painel. Outros erros: tenta de novo depois.
    if (err.code === 10003 || err.code === 10008 || err.code === 10013) {
      panels.delete(guildId);
      await saveState(guildId, { panelChannelId: null, panelMessageId: null });
    } else {
      console.warn(`[CALL] Não consegui buscar o painel (${err.message}).`);
    }
    return;
  }

  try {
    await message.edit({
      components: buildBotcallPanel(state),
      flags: MessageFlags.IsComponentsV2,
    });
    ref.signature = signature;
  } catch (err) {
    console.warn(`[CALL] Não consegui atualizar o painel (${err.message}).`);
  }
}

// Agenda a atualização do painel (junta vários eventos seguidos numa única edição)
function schedulePanelRefresh(guildId, delayMs = TIMINGS.panelDebounce) {
  if (!panels.has(guildId) || panelTimers.has(guildId)) return;
  const timer = setTimeout(() => {
    panelTimers.delete(guildId);
    refreshPanel(guildId).catch((err) => console.error("[CALL] Erro ao atualizar painel:", err.message));
  }, delayMs);
  panelTimers.set(guildId, timer);
}

// Define qual painel é atualizado em tempo real (o último enviado/usado).
// Se "rendered" for passado, o painel já está desenhado com esse estado e não precisa de nova edição.
function registerPanel(guildId, channelId, messageId, rendered = null) {
  const current = panels.get(guildId);
  const changed = !current || current.channelId !== channelId || current.messageId !== messageId;

  panels.set(guildId, {
    channelId,
    messageId,
    signature: rendered ? signatureOf(rendered) : null,
  });

  if (changed) saveState(guildId, { panelChannelId: channelId, panelMessageId: messageId });
  if (!rendered) schedulePanelRefresh(guildId);
}

// ---------- detecção de desconexão manual (registro de auditoria) ----------

async function fetchDisconnectEntries(guild) {
  try {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberDisconnect, limit: 10 });
    return [...logs.entries.values()];
  } catch (err) {
    console.warn(
      `[CALL] Não consegui ler o registro de auditoria (${err.message}). ` +
        "Dê a permissão 'Ver registro de auditoria' ao bot para detectar desconexões manuais."
    );
    return null;
  }
}

// Guarda a contagem atual para só reagir a desconexões NOVAS depois disso
async function snapshotAuditCounts(guild) {
  const entries = await fetchDisconnectEntries(guild);
  for (const entry of entries ?? []) {
    auditCounts.set(entry.id, entry.extra?.count ?? 1);
  }
}

// true se alguém (que não seja o próprio bot) desconectou membros da call agora há pouco
async function wasManuallyDisconnected(guild) {
  for (const wait of TIMINGS.auditWaits) {
    await sleep(wait); // o registro de auditoria demora um pouco para aparecer
    const entries = await fetchDisconnectEntries(guild);
    if (entries === null) return false; // sem como saber: trata como falha de conexão

    for (const entry of entries) {
      if (entry.executorId === client.user.id) continue;

      const count = entry.extra?.count ?? 1;
      const previous = auditCounts.get(entry.id);
      auditCounts.set(entry.id, count);

      const isNew =
        previous === undefined
          ? Date.now() - entry.createdTimestamp < TIMINGS.auditRecent
          : count > previous;
      if (isNew) return true;
    }
  }
  return false;
}

// ---------- perda de conexão ----------

// Chamado quando o bot saiu da call sem que o próprio código tenha pedido.
// Decide: foi alguém desconectando manualmente (para) ou foi falha (reconecta).
async function handleLoss(guildId, { checkExpected = true } = {}) {
  if (!desired.has(guildId)) return;
  if (checkExpected && isExpectedLeave(guildId)) return;
  if (deciding.has(guildId)) return;

  deciding.add(guildId);
  try {
    const guild = client.guilds.cache.get(guildId);
    const manual = guild ? await wasManuallyDisconnected(guild) : false;

    if (manual) {
      console.log("[CALL] Bot desconectado manualmente por um membro: não vai reconectar.");
      await stopKeeping(guildId);
    } else {
      console.warn("[CALL] Conexão com a call perdida (falha): reconectando...");
      scheduleReconnect(guildId, TIMINGS.restoreDelay);
      schedulePanelRefresh(guildId);
    }
  } finally {
    deciding.delete(guildId);
  }
}

// ---------- reconexão ----------

function scheduleReconnect(guildId, delayMs) {
  if (!desired.has(guildId)) return;
  const state = getRetry(guildId);
  if (state.timer) return;
  state.timer = setTimeout(() => {
    state.timer = null;
    attemptReconnect(guildId);
  }, delayMs);
}

async function attemptReconnect(guildId) {
  await withLock(guildId, async () => {
    const channelId = desired.get(guildId);
    if (!channelId) return;

    const state = getRetry(guildId);
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild || !guild.available) throw new Error("servidor indisponível");

      if (isHealthy(guild, channelId)) {
        state.attempts = 0;
        return;
      }

      const channel = await guild.channels.fetch(channelId).catch((err) => {
        if (err.code === 10003) return null; // Unknown Channel (call apagada)
        throw err;
      });

      if (!channel || !channel.isVoiceBased()) {
        console.warn("[CALL] A call salva não existe mais. Parando a reconexão.");
        desired.delete(guildId);
        lastChannels.delete(guildId);
        clearRetry(guildId);
        await saveState(guildId, { active: false, channelId: null });
        schedulePanelRefresh(guildId);
        return;
      }

      if (!channel.joinable) throw new Error("sem permissão para entrar ou call lotada");

      await connectToChannel(channel);
      state.attempts = 0;
      console.log(`[CALL] Reconectado na call ${channel.name}.`);
      schedulePanelRefresh(guildId);
    } catch (err) {
      state.attempts++;
      const delay = Math.min(TIMINGS.retryBase * 2 ** (state.attempts - 1), TIMINGS.retryMax);
      console.warn(
        `[CALL] Falha ao reconectar (tentativa ${state.attempts}): ${err.message}. ` +
          `Nova tentativa em ${Math.round(delay / 1000)}s.`
      );
      scheduleReconnect(guildId, delay);
      schedulePanelRefresh(guildId);
    }
  });
}

// ---------- conexão de voz ----------

async function connectToChannel(channel) {
  const guildId = channel.guild.id;

  destroyConnection(guildId);

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: true,
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, TIMINGS.readyTimeout);
  } catch (err) {
    destroyConnection(guildId);
    throw err;
  }

  connection.on("error", (err) => console.error("[CALL] Erro na conexão de voz:", err.message));
  connection.on("stateChange", () => schedulePanelRefresh(guildId));
  schedulePanelRefresh(guildId);

  // Se a conexão cair: dá uns segundos para a própria lib se recuperar (ex.: bot movido de call);
  // se não recuperar, trata como perda de conexão.
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, TIMINGS.recoverWindow),
        entersState(connection, VoiceConnectionStatus.Connecting, TIMINGS.recoverWindow),
      ]);
    } catch {
      if (getVoiceConnection(guildId) !== connection) return; // conexão antiga, já substituída
      destroyConnection(guildId);
      handleLoss(guildId, { checkExpected: false });
    }
  });

  snapshotAuditCounts(channel.guild).catch(() => {});
  return connection;
}

// ---------- API usada pelo painel do botcall ----------

// Entra na call e passa a mantê-la. Lança erro se não conseguir conectar.
function joinCall(channel) {
  const guildId = channel.guild.id;
  return withLock(guildId, async () => {
    const previous = desired.get(guildId);
    clearRetry(guildId);
    desired.set(guildId, channel.id);

    try {
      await connectToChannel(channel);
    } catch (err) {
      // Volta a manter a call anterior (se havia) e avisa quem chamou
      if (previous) {
        desired.set(guildId, previous);
        scheduleReconnect(guildId, TIMINGS.restoreDelay);
      } else {
        desired.delete(guildId);
      }
      schedulePanelRefresh(guildId);
      throw err;
    }

    lastChannels.set(guildId, channel.id);
    await saveState(guildId, { channelId: channel.id, active: true });
    schedulePanelRefresh(guildId);
  });
}

// Desconexão de propósito (botão Desconectar ou staff): para de manter a call
async function stopKeeping(guildId) {
  desired.delete(guildId); // síncrono: já impede novas reconexões
  clearRetry(guildId);
  await withLock(guildId, async () => {
    destroyConnection(guildId);
    await saveState(guildId, { active: false });
    schedulePanelRefresh(guildId);
  });
}

function getKeptChannel(guildId) {
  return desired.get(guildId) ?? null;
}

// ---------- eventos / inicialização ----------

// Chamado pelo evento voiceStateUpdate quando o estado de voz É DO PRÓPRIO BOT
function onBotVoiceStateUpdate(oldState, newState) {
  const guildId = newState.guild.id;
  schedulePanelRefresh(guildId); // qualquer mudança do bot na call atualiza o painel

  if (!desired.has(guildId)) return;

  const from = oldState.channelId;
  const to = newState.channelId;

  if (from && !to) {
    handleLoss(guildId); // saiu da call: foi manual ou falha?
  } else if (from && to && from !== to) {
    // Alguém moveu o bot para outra call: passa a manter a nova
    desired.set(guildId, to);
    lastChannels.set(guildId, to);
    saveState(guildId, { channelId: to });
  }
}

function runWatchdog() {
  const now = Date.now();

  for (const [guildId, channelId] of desired) {
    const connection = getVoiceConnection(guildId);
    const status = connection?.state.status;

    if (!connection || status === VoiceConnectionStatus.Destroyed) {
      notReadySince.delete(guildId);
      scheduleReconnect(guildId, 0);
      continue;
    }

    if (status !== VoiceConnectionStatus.Ready) {
      const since = notReadySince.get(guildId) ?? now;
      notReadySince.set(guildId, since);
      if (now - since > TIMINGS.stuckLimit) {
        notReadySince.delete(guildId);
        destroyConnection(guildId);
        scheduleReconnect(guildId, 0);
      }
      continue;
    }

    notReadySince.delete(guildId);
    const actual = client.guilds.cache.get(guildId)?.members.me?.voice?.channelId;
    if (actual === channelId) {
      mismatches.delete(guildId);
      continue;
    }

    // Conexão "pronta" mas o Discord diz que o bot não está na call (duas checagens seguidas)
    const count = (mismatches.get(guildId) ?? 0) + 1;
    mismatches.set(guildId, count);
    if (count >= 2) {
      mismatches.delete(guildId);
      handleLoss(guildId, { checkExpected: false });
    }
  }
}

// Chamado uma vez quando o bot fica online: carrega do MongoDB e reconecta
async function startCallKeeper(discordClient) {
  client = discordClient;

  try {
    const states = await CallState.find({});
    for (const state of states) {
      if (state.channelId) lastChannels.set(state.guildId, state.channelId);

      if (state.panelChannelId && state.panelMessageId) {
        panels.set(state.guildId, {
          channelId: state.panelChannelId,
          messageId: state.panelMessageId,
          signature: null,
        });
      }

      if (state.active && state.channelId) {
        desired.set(state.guildId, state.channelId);
        scheduleReconnect(state.guildId, TIMINGS.restoreDelay);
        console.log(`[CALL] Restaurando call salva (${state.channelId}) após reinício.`);
      }

      // O painel pode estar mostrando "Conectado" de antes do reinício: corrige já
      schedulePanelRefresh(state.guildId, 0);
    }
  } catch (err) {
    console.error("[CALL] Erro ao carregar calls salvas:", err.message);
  }

  setInterval(runWatchdog, TIMINGS.watchdogInterval).unref?.();
}

module.exports = {
  TIMINGS,
  startCallKeeper,
  joinCall,
  stopKeeping,
  getKeptChannel,
  registerPanel,
  onBotVoiceStateUpdate,
};
