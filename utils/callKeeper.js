const {
  joinVoiceChannel,
  getVoiceConnection,
  entersState,
  VoiceConnectionStatus,
  VoiceConnectionDisconnectReason,
} = require("@discordjs/voice");
const store = require("./botcall/state");
const audit = require("./botcall/audit");
const panels = require("./botcall/panels");

// Sistema de call do bot (n!botcall).
//
// O que ele garante:
//  - o bot entra na call escolhida e FICA nela a qualquer custo;
//  - se a conexão cair, ele reconecta sozinho (com espera crescente, sem nunca desistir);
//  - se o bot reiniciar (deploy, Render dormindo, queda), a call salva no MongoDB é restaurada ao ficar online;
//  - se um membro com permissão desconectar o bot manualmente, ele NÃO volta;
//  - os painéis do n!botcall mostram sempre a situação real (conectado, reconectando, desconectado).
//
// Cada servidor tem uma "sessão" em memória. Todas as operações de voz de um servidor passam por uma fila,
// então nunca duas operações mexem na conexão ao mesmo tempo.

// Tempos em ms. Exportado só para poder ajustar/testar.
const TIMINGS = {
  restoreDelay: 4_000, // espera antes de reconectar ao iniciar (dá tempo de uma instância antiga terminar)
  reconnectFast: 1_500, // espera antes da 1ª reconexão depois de uma queda
  retryBase: 3_000, // 1ª espera entre tentativas que falharam (dobra a cada falha)
  retryMax: 60_000, // espera máxima entre tentativas (nunca desiste)
  readyTimeout: 20_000, // tempo máximo para a conexão ficar pronta
  recoverWindow: 5_000, // tempo que a lib tem para se recuperar sozinha (ex.: bot movido de call)
  watchdogInterval: 20_000, // verificação periódica
  stuckLimit: 60_000, // tempo máximo "conectando" antes de forçar uma nova conexão
  expectedLeaveTtl: 10_000, // quanto tempo uma saída causada pelo próprio bot é ignorada
  voiceStateWait: 3_000, // espera pelo Discord confirmar que o bot está na call
};

const KICK_CLOSE_CODE = 4014; // o Discord fecha a voz com esse código quando o bot é removido/desconectado

// Erro com código para os handlers explicarem o motivo para a pessoa
class CallError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.name = "CallError";
    this.code = code; // "invalid_channel" | "not_joinable" | "connect_failed"
  }
}

let client = null;
let started = false;
const sessions = new Map(); // guildId -> sessão

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const guildOf = (guildId) => client?.guilds.cache.get(guildId) ?? null;

// ---------- sessão ----------

function getSession(guildId) {
  let s = sessions.get(guildId);
  if (!s) {
    s = {
      guildId,
      channelId: null, // call escolhida (continua guardada mesmo desconectado, para o botão Conectar)
      active: false, // true = o bot deve estar na call
      stopReason: null, // por que está inativo: button | member | channel_deleted
      phase: "stopped", // stopped | connecting | connected | reconnecting
      connectedAt: null,
      connection: null,
      attempts: 0,
      retryTimer: null,
      chain: Promise.resolve(), // fila de operações
      busy: 0, // operações em andamento na fila
      deciding: false, // analisando se uma saída foi manual ou falha
      expectedLeaves: [], // saídas causadas pelo próprio bot (timestamps)
      notReadySince: null,
      mismatches: 0,
    };
    sessions.set(guildId, s);
  }
  return s;
}

// Roda a operação depois das anteriores do mesmo servidor
function enqueue(s, fn) {
  const run = s.chain.then(async () => {
    s.busy++;
    try {
      return await fn();
    } finally {
      s.busy--;
    }
  });
  s.chain = run.catch(() => {});
  return run;
}

function clearRetry(s) {
  if (s.retryTimer) clearTimeout(s.retryTimer);
  s.retryTimer = null;
}

// ---------- estado que a interface mostra ----------

function isHealthy(s) {
  const connection = getVoiceConnection(s.guildId);
  return Boolean(
    s.channelId &&
      connection?.state.status === VoiceConnectionStatus.Ready &&
      guildOf(s.guildId)?.members.me?.voice?.channelId === s.channelId
  );
}

// Estado real do bot para os painéis: { channelId, status, reason, since }
// status: connected | connecting | reconnecting | disconnected
function getCallView(guildId) {
  const s = sessions.get(guildId);
  if (!s) return { channelId: null, status: "disconnected", reason: null, since: null };

  const base = { channelId: s.channelId, reason: s.stopReason, since: null };
  if (!s.active) return { ...base, status: "disconnected" };
  if (isHealthy(s)) return { ...base, reason: null, status: "connected", since: s.connectedAt };
  if (s.phase === "connecting") return { ...base, reason: null, status: "connecting" };
  return { ...base, reason: null, status: "reconnecting" };
}

const getSelectedChannel = (guildId) => sessions.get(guildId)?.channelId ?? null;

// ---------- conexão de voz ----------

// Saídas causadas pelo próprio bot (destruir a conexão, trocar de call) não podem ser tratadas como queda
function expectLeave(s) {
  s.expectedLeaves.push(Date.now());
}

function consumeExpectedLeave(s) {
  const now = Date.now();
  s.expectedLeaves = s.expectedLeaves.filter((at) => now - at < TIMINGS.expectedLeaveTtl);
  return s.expectedLeaves.shift() !== undefined;
}

// Destrói a conexão atual. Retorna true se existia uma conexão para destruir.
function dropConnection(s, { expected = true } = {}) {
  const connection = getVoiceConnection(s.guildId);
  s.connection = null;
  if (!connection || connection.state.status === VoiceConnectionStatus.Destroyed) return false;

  // Só espera um evento de saída se o Discord ainda mostra o bot numa call; senão uma marca esquecida
  // faria uma desconexão manual logo depois ser ignorada.
  if (expected && guildOf(s.guildId)?.members.me?.voice?.channelId) expectLeave(s);
  try {
    connection.destroy();
  } catch (err) {
    console.warn("[BOTCALL] Erro ao destruir a conexão de voz:", err.message);
  }
  return true;
}

// O Discord ainda mostra o bot numa call mas esta instância não tem conexão (estado antigo):
// entra e destrói a conexão, que é o jeito oficial da lib de mandar a saída para o Discord.
function forceLeave(s, guild) {
  const channelId = guild.members.me?.voice?.channelId;
  if (!channelId) return;
  try {
    expectLeave(s);
    joinVoiceChannel({ channelId, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator }).destroy();
  } catch (err) {
    console.warn("[BOTCALL] Não consegui tirar o bot da call:", err.message);
  }
}

async function waitForVoiceState(guild, channelId) {
  const end = Date.now() + TIMINGS.voiceStateWait;
  while (Date.now() < end) {
    if (guild.members.me?.voice?.channelId === channelId) return true;
    await sleep(100);
  }
  return false;
}

function attachListeners(s, connection) {
  connection.on("error", (err) => console.error("[BOTCALL] Erro na conexão de voz:", err.message));

  connection.on("stateChange", (_old, next) => {
    if (s.connection !== connection) return;
    if (next.status === VoiceConnectionStatus.Ready && s.active) {
      // a própria lib se recuperou (ex.: bot movido de call)
      s.connectedAt ??= Date.now();
      s.phase = "connected";
      s.notReadySince = null;
    }
    panels.schedule(s.guildId);
  });

  // Se a conexão cair: a lib tem alguns segundos para se recuperar sozinha; se não recuperar, é perda de conexão
  connection.on(VoiceConnectionStatus.Disconnected, (_old, next) => {
    onVoiceDisconnected(s, connection, next).catch((err) =>
      console.error("[BOTCALL] Erro ao tratar a queda da conexão:", err.message)
    );
  });
}

async function onVoiceDisconnected(s, connection, next) {
  const kicked =
    next.reason === VoiceConnectionDisconnectReason.WebSocketClose && next.closeCode === KICK_CLOSE_CODE;

  try {
    await Promise.race([
      entersState(connection, VoiceConnectionStatus.Signalling, TIMINGS.recoverWindow),
      entersState(connection, VoiceConnectionStatus.Connecting, TIMINGS.recoverWindow),
    ]);
    return; // a lib se recuperou sozinha
  } catch {
    // não recuperou
  }

  if (s.connection !== connection || !s.active) return; // conexão antiga, já substituída ou parada de propósito
  dropConnection(s, { expected: false });
  // Remoção pelo Discord pode ter sido manual: confere o registro de auditoria. Outras falhas só reconectam.
  triggerLoss(s, { source: "voice", skipAudit: !kicked });
}

// Cria a conexão e espera ela ficar pronta. Sempre roda dentro da fila do servidor.
async function establish(s, channel) {
  const guild = channel.guild;

  dropConnection(s);
  s.connectedAt = null;

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: false,
  });
  s.connection = connection;
  attachListeners(s, connection);

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, TIMINGS.readyTimeout);
  } catch (err) {
    if (s.connection === connection) dropConnection(s);
    throw err;
  }

  await waitForVoiceState(guild, channel.id);

  s.connectedAt = Date.now();
  s.phase = "connected";
  s.mismatches = 0;
  s.notReadySince = null;
  console.log(`[BOTCALL] Conectado na call ${channel.name}.`);

  audit.snapshot(guild).catch(() => {});
  panels.schedule(s.guildId);
}

// ---------- perda de conexão ----------

function triggerLoss(s, options) {
  handleLoss(s, options).catch((err) => console.error("[BOTCALL] Erro ao tratar a perda da call:", err.message));
}

// O bot saiu da call sem que o próprio código tenha pedido.
// Decide: foi um membro desconectando de propósito (para de vez) ou foi falha (reconecta).
async function handleLoss(s, { source, ignoreExpected = false, skipAudit = false } = {}) {
  if (!s.active || s.deciding) return;
  if (!ignoreExpected && source === "gateway" && consumeExpectedLeave(s)) return;

  s.deciding = true;
  try {
    s.connectedAt = null;
    s.phase = "reconnecting";
    panels.schedule(s.guildId);

    const guild = guildOf(s.guildId);
    if (!skipAudit && guild) {
      const manual = await audit.wasDisconnectedByMember(guild, client.user.id);
      if (!s.active) return; // mudou durante a espera
      if (isHealthy(s)) return; // já voltou sozinho
      if (manual) {
        console.log("[BOTCALL] Bot desconectado manualmente por um membro: não vai reconectar.");
        await stopCall(s.guildId, "member");
        return;
      }
    }

    console.warn("[BOTCALL] Conexão com a call perdida (falha): reconectando...");
    scheduleReconnect(s, TIMINGS.reconnectFast);
  } finally {
    s.deciding = false;
  }
}

// ---------- reconexão ----------

function scheduleReconnect(s, delay) {
  if (!s.active || s.retryTimer) return;
  s.retryTimer = setTimeout(() => {
    s.retryTimer = null;
    attemptReconnect(s).catch((err) => console.error("[BOTCALL] Erro ao reconectar:", err.message));
  }, delay);
}

function attemptReconnect(s) {
  return enqueue(s, async () => {
    if (!s.active || !s.channelId) return;

    try {
      const guild = guildOf(s.guildId);
      if (!guild || !guild.available) throw new Error("servidor indisponível");

      if (isHealthy(s)) {
        s.attempts = 0;
        s.phase = "connected";
        return;
      }

      s.phase = "reconnecting";
      const channel = await guild.channels.fetch(s.channelId).catch((err) => {
        if (err.code === 10003) return null; // Unknown Channel: a call foi apagada
        throw err;
      });

      if (!channel || !channel.isVoiceBased()) {
        console.warn("[BOTCALL] A call salva não existe mais. Parando a reconexão.");
        await stopNow(s, "channel_deleted", { clearChannel: true });
        return;
      }

      if (!channel.joinable) throw new CallError("not_joinable", "sem permissão para entrar ou call lotada");

      await establish(s, channel);
      s.attempts = 0;
      console.log("[BOTCALL] Reconexão concluída.");
    } catch (err) {
      if (!s.active) return;
      s.attempts++;
      const delay = Math.min(TIMINGS.retryBase * 2 ** (s.attempts - 1), TIMINGS.retryMax);
      console.warn(
        `[BOTCALL] Falha ao reconectar (tentativa ${s.attempts}): ${err.message}. ` +
          `Nova tentativa em ${Math.round(delay / 1000)}s.`
      );
      scheduleReconnect(s, delay);
      panels.schedule(s.guildId);
    }
  });
}

// ---------- API usada pelo painel ----------

// Entra na call e passa a mantê-la. Lança CallError se não conseguir.
function joinCall(channel) {
  if (!channel || typeof channel.isVoiceBased !== "function" || !channel.isVoiceBased()) {
    return Promise.reject(new CallError("invalid_channel"));
  }
  if (!channel.joinable) return Promise.reject(new CallError("not_joinable"));

  client ??= channel.client;
  const s = getSession(channel.guild.id);
  clearRetry(s);

  return enqueue(s, async () => {
    const previous = { channelId: s.channelId, active: s.active, stopReason: s.stopReason, phase: s.phase };

    s.channelId = channel.id;
    s.active = true;
    s.stopReason = null;
    s.phase = "connecting";
    panels.schedule(s.guildId);

    try {
      await establish(s, channel);
    } catch (err) {
      // Volta a manter a call anterior (se havia) e avisa quem chamou
      Object.assign(s, previous);
      if (s.active) {
        s.phase = "reconnecting";
        scheduleReconnect(s, TIMINGS.reconnectFast);
      }
      panels.schedule(s.guildId);
      throw new CallError("connect_failed", err.message);
    }

    s.attempts = 0;
    await store.save(s.guildId, { channelId: s.channelId, active: true, stopReason: null });
    panels.schedule(s.guildId);
  });
}

// Desconexão de propósito: o bot sai e NÃO volta sozinho.
// reason: "button" (painel) | "member" (membro desconectou) | "channel_deleted"
async function stopNow(s, reason, { clearChannel = false } = {}) {
  s.active = false;
  s.stopReason = reason;
  s.phase = "stopped";
  s.connectedAt = null;
  s.mismatches = 0;
  s.notReadySince = null;
  s.attempts = 0;
  clearRetry(s);
  if (clearChannel) s.channelId = null;

  const hadConnection = dropConnection(s);
  const guild = guildOf(s.guildId);
  if (!hadConnection && guild) forceLeave(s, guild);

  await store.save(s.guildId, { active: false, stopReason: reason, channelId: s.channelId });
  panels.schedule(s.guildId, 0);
}

function stopCall(guildId, reason = "button", options = {}) {
  const s = getSession(guildId);
  s.active = false; // síncrono: já impede novas reconexões
  clearRetry(s);
  return enqueue(s, () => stopNow(s, reason, options));
}

// ---------- eventos ----------

// Chamado pelo evento voiceStateUpdate quando o estado de voz É DO PRÓPRIO BOT
function onBotVoiceStateUpdate(oldState, newState) {
  client ??= newState.client;
  const guildId = newState.guild.id;
  const from = oldState.channelId;
  const to = newState.channelId;
  if (from === to) return; // só mudou mute/ensurdecer

  panels.schedule(guildId);

  const s = sessions.get(guildId);
  if (!s || !s.active) return;

  if (from && !to) {
    triggerLoss(s, { source: "gateway" }); // saiu da call: foi manual ou falha?
  } else if (from && to) {
    // Alguém moveu o bot para outra call: passa a manter a nova
    s.channelId = to;
    store.save(guildId, { channelId: to });
  }
}

function checkSession(s) {
  if (!s.active || !s.channelId) return;
  if (s.busy > 0 || s.deciding || s.retryTimer) return; // já tem algo em andamento

  const guild = guildOf(s.guildId);
  const connection = getVoiceConnection(s.guildId);
  const status = connection?.state.status;

  if (!connection || status === VoiceConnectionStatus.Destroyed) {
    s.phase = "reconnecting";
    s.connectedAt = null;
    s.notReadySince = null;
    scheduleReconnect(s, 0);
    panels.schedule(s.guildId);
    return;
  }

  if (status !== VoiceConnectionStatus.Ready) {
    const since = s.notReadySince ?? Date.now();
    s.notReadySince = since;
    if (Date.now() - since > TIMINGS.stuckLimit) {
      s.notReadySince = null;
      dropConnection(s, { expected: false });
      scheduleReconnect(s, 0);
    }
    return;
  }

  s.notReadySince = null;
  if (guild?.members.me?.voice?.channelId === s.channelId) {
    s.mismatches = 0;
    audit.snapshot(guild).catch(() => {}); // mantém a contagem de desconexões atual
    panels.schedule(s.guildId); // garante que os painéis estão em dia
    return;
  }

  // Conexão "pronta" mas o Discord diz que o bot não está na call (duas checagens seguidas)
  s.mismatches++;
  if (s.mismatches >= 2) {
    s.mismatches = 0;
    triggerLoss(s, { source: "watchdog", ignoreExpected: true });
  }
}

function runWatchdog() {
  for (const s of sessions.values()) {
    try {
      checkSession(s);
    } catch (err) {
      console.error("[BOTCALL] Erro na verificação periódica:", err.message);
    }
  }
}

// ---------- inicialização ----------

// Chamado UMA vez quando o bot fica online (events/ready.js): carrega o MongoDB e volta para a call salva
async function startCallKeeper(discordClient) {
  if (started) return;
  started = true;
  client = discordClient;
  panels.init(client, getCallView);

  let saved = [];
  try {
    saved = await store.loadAll();
  } catch (err) {
    console.error("[BOTCALL] Erro ao carregar as calls salvas:", err.message);
  }

  for (const doc of saved) {
    const s = getSession(doc.guildId);
    s.channelId = doc.channelId;
    s.stopReason = doc.stopReason;
    s.active = Boolean(doc.active && doc.channelId);
    panels.load(doc.guildId, doc.panels);

    if (s.active) {
      s.phase = "reconnecting";
      scheduleReconnect(s, TIMINGS.restoreDelay);
      console.log(`[BOTCALL] Restaurando a call salva (${s.channelId}) após o reinício.`);
    }

    // O painel pode estar mostrando "Conectado" de antes do reinício: corrige já
    panels.schedule(doc.guildId, 0);
  }

  // A call foi apagada: para de tentar voltar e libera a seleção
  client.on("channelDelete", (channel) => {
    const s = sessions.get(channel.guildId);
    if (s && s.channelId === channel.id) {
      console.warn("[BOTCALL] A call selecionada foi apagada.");
      stopCall(s.guildId, "channel_deleted", { clearChannel: true }).catch(() => {});
    }
  });

  // Nova sessão com o gateway do Discord: confere logo se o bot continua na call
  client.on("shardReady", () => {
    for (const s of sessions.values()) if (s.active) s.mismatches = 1;
    setTimeout(runWatchdog, 8_000).unref?.();
  });

  setInterval(runWatchdog, TIMINGS.watchdogInterval).unref?.();

  const active = [...sessions.values()].filter((s) => s.active).length;
  console.log(`[BOTCALL] Sistema de call iniciado. Calls para restaurar: ${active}.`);
}

module.exports = {
  TIMINGS,
  CallError,
  startCallKeeper,
  joinCall,
  stopCall,
  getCallView,
  getSelectedChannel,
  onBotVoiceStateUpdate,
  registerPanel: panels.register,
  markPanelRendered: panels.markRendered,
  refreshPanels: panels.refresh,
};
