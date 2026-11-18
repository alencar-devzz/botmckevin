const { MessageFlags } = require("discord.js");
const { buildBotcallPanel } = require("../../ui/botcall");
const state = require("./state");

// Painéis do n!botcall que são atualizados em tempo real.
// Vários painéis podem existir ao mesmo tempo (os MAX_PANELS mais recentes); todos mostram o mesmo estado.
const MAX_PANELS = 10;
const DEBOUNCE_MS = 1_000; // junta várias mudanças seguidas numa única edição
const GONE = new Set([10003, 10008]); // Unknown Channel / Unknown Message: o painel foi apagado

let client = null;
let viewProvider = () => ({ channelId: null, status: "disconnected", reason: null, since: null });

const registry = new Map(); // guildId -> [{ channelId, messageId, signature }]
const timers = new Map(); // guildId -> { handle, due }
const runs = new Map(); // guildId -> promise da última atualização (uma por vez)

// O keeper informa o client e como calcular o estado atual do bot
function init(discordClient, provider) {
  client = discordClient;
  viewProvider = provider;
}

// Resumo do que o painel mostra. Se for igual ao que já está na mensagem, não precisa editar.
function signatureOf(view) {
  return [
    view.channelId ?? "",
    view.status,
    view.reason ?? "",
    view.since ? Math.floor(view.since / 1000) : 0,
  ].join("|");
}

const list = (guildId) => registry.get(guildId) ?? [];

function persist(guildId) {
  return state.save(guildId, {
    panels: list(guildId).map(({ channelId, messageId }) => ({ channelId, messageId })),
  });
}

// Carrega os painéis salvos (ao iniciar o bot)
function load(guildId, refs) {
  registry.set(
    guildId,
    refs.map(({ channelId, messageId }) => ({ channelId, messageId, signature: null }))
  );
}

// Registra um painel para atualização em tempo real (o usado por último fica por último na lista).
// - rendered: o painel já está desenhado com esse estado, então não precisa de nova edição.
// - refresh: false evita agendar uma atualização (quem chamou vai atualizar o painel logo em seguida).
function register(guildId, channelId, messageId, { rendered = null, refresh = true } = {}) {
  const refs = list(guildId);
  const existing = refs.find((ref) => ref.messageId === messageId);
  const ref = existing ?? { channelId, messageId, signature: null };
  ref.channelId = channelId;

  const next = refs.filter((item) => item !== ref);
  next.push(ref);
  while (next.length > MAX_PANELS) next.shift();
  registry.set(guildId, next);

  if (rendered) ref.signature = signatureOf(rendered);

  if (!existing) {
    console.log(`[BOTCALL] Painel registrado para atualização em tempo real (mensagem ${messageId}).`);
    persist(guildId);
  }
  if (refresh && !rendered) schedule(guildId);
}

// Marca que o painel já foi desenhado com esse estado (depois de editar a mensagem pela interação)
function markRendered(guildId, messageId, view) {
  const ref = list(guildId).find((item) => item.messageId === messageId);
  if (ref) ref.signature = signatureOf(view);
}

// Agenda a atualização (várias chamadas seguidas viram uma só edição)
function schedule(guildId, delay = DEBOUNCE_MS) {
  if (list(guildId).length === 0) return;

  const due = Date.now() + delay;
  const current = timers.get(guildId);
  if (current && current.due <= due) return;
  if (current) clearTimeout(current.handle);

  const handle = setTimeout(() => {
    timers.delete(guildId);
    refresh(guildId).catch((err) => console.error("[BOTCALL] Erro ao atualizar o painel:", err.message));
  }, delay);
  timers.set(guildId, { handle, due });
}

// Atualiza todos os painéis do servidor agora. force = edita mesmo que pareça igual.
function refresh(guildId, { force = false } = {}) {
  const previous = runs.get(guildId) ?? Promise.resolve();
  const run = previous.then(() => doRefresh(guildId, force));
  runs.set(guildId, run.catch(() => {}));
  return run;
}

async function doRefresh(guildId, force) {
  if (!client) return;
  const refs = [...list(guildId)];
  if (refs.length === 0) return;

  const view = viewProvider(guildId);
  const signature = signatureOf(view);
  const payload = { components: buildBotcallPanel(view), flags: MessageFlags.IsComponentsV2 };
  const gone = [];

  for (const ref of refs) {
    if (!force && ref.signature === signature) continue;

    try {
      const channel = await client.channels.fetch(ref.channelId);
      const message = await channel.messages.fetch(ref.messageId);
      await message.edit(payload);
      ref.signature = signature;
    } catch (err) {
      if (GONE.has(err.code)) gone.push(ref);
      else console.warn(`[BOTCALL] Não consegui atualizar um painel (${err.message}).`);
    }
  }

  if (gone.length > 0) {
    registry.set(
      guildId,
      list(guildId).filter((ref) => !gone.includes(ref))
    );
    await persist(guildId);
  }
}

module.exports = { init, load, register, markRendered, schedule, refresh, list, signatureOf };
