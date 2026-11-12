const { PermissionFlagsBits, MessageFlags, ContainerBuilder, TextDisplayBuilder, WebhookType } = require("discord.js");
const { getAntiRaidConfig } = require("./store");
const { sendModuleAlert, code } = require("./alert");
const { suppressMessage } = require("../logs/suppress");

// Anti-spam: conta mensagens por pessoa numa janela curta. O volume sozinho só pune
// se o painel permitir; por padrão exige também um sinal real de spam.

const INVITE = /(discord\.gg|discord(?:app)?\.com\/invite)\/\S+/i;
const LINK = /https?:\/\/\S+/i;

const states = new Map(); // "guild:user" -> { entries: [], warns, last }

// Texto "limpo" para comparar mensagens parecidas: só letras, sem espaços, números, símbolos nem
// maiúsculas. "oi gente 123" e "OI gente!! 987" contam como iguais (spam costuma mudar um número no fim).
// Mensagem só com anexo/figurinha usa uma assinatura dos anexos.
function contentKey(message) {
  const text = message.content.toLowerCase().normalize("NFKD").replace(/[^\p{L}]/gu, "").slice(0, 200);
  if (text) return text;
  const files = [...message.attachments.values()].map((a) => `${a.size}`).join(",");
  const stickers = [...message.stickers.keys()].join(",");
  return files || stickers ? `anexo:${files}|${stickers}` : "";
}

function mentionCount(message) {
  return message.mentions.users.size + message.mentions.roles.size + (message.mentions.everyone ? 5 : 0);
}

function detectSignals(entries, s) {
  const found = [];
  if (s.signals.includes("duplicates")) {
    const seen = new Map();
    for (const e of entries) if (e.content) seen.set(e.content, (seen.get(e.content) ?? 0) + 1);
    if ([...seen.values()].some((n) => n >= 3)) found.push("duplicates");
  }
  if (s.signals.includes("mentions") && entries.some((e) => e.mentions >= s.mentionLimit)) found.push("mentions");
  if (s.signals.includes("invites") && entries.some((e) => e.invite)) found.push("invites");
  if (s.signals.includes("links") && entries.filter((e) => e.link).length >= 3) found.push("links");
  return found;
}

function isExempt(message, s) {
  const { member, guild, channel } = message;
  if (!member) {
    // webhook: não tem cargos nem permissões, só dá para isentar o canal
    return s.exemptChannels.includes(channel.id) || (channel.parentId && s.exemptChannels.includes(channel.parentId));
  }
  if (member.id === guild.ownerId || s.exemptUsers.includes(member.id)) return true;
  if (s.exemptChannels.includes(channel.id) || (channel.parentId && s.exemptChannels.includes(channel.parentId))) return true;
  if (s.exemptRoles.length && member.roles.cache.hasAny(...s.exemptRoles)) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (s.ignoreStaff && member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
  return false;
}

async function deleteFlagged(message, entries) {
  const byChannel = new Map();
  for (const e of entries) suppressMessage(e.id); // não vira "Mensagem apagada" nos logs gerais
  for (const e of entries) byChannel.set(e.channelId, [...(byChannel.get(e.channelId) ?? []), e.id]);
  for (const [channelId, ids] of byChannel) {
    const channel = message.guild.channels.cache.get(channelId);
    if (!channel?.bulkDelete) continue;
    if (ids.length === 1) await channel.messages.delete(ids[0]).catch(() => {});
    else await channel.bulkDelete(ids, true).catch(() => {});
  }
}

// Spam por webhook: o webhook não pode ser silenciado, então a resposta é apagar as mensagens e o próprio webhook
async function handleWebhookSpam(message, cfg, flagged, found) {
  const s = cfg.spam;
  if (s.deleteMessages) await deleteFlagged(message, flagged);

  const hook = await message.fetchWebhook().catch(() => null);
  let result = "não consegui achar o webhook";
  if (hook) {
    if (hook.type !== WebhookType.Incoming) {
      result = "webhook de integração/seguidor: só apaguei as mensagens";
    } else {
      result = await hook
        .delete("Anti-Raid: spam por webhook")
        .then(() => "webhook apagado")
        .catch(() => "não consegui apagar o webhook (falta Gerenciar webhooks?)");
    }
  }

  await sendModuleAlert(message.guild, cfg, s.alertChannelId, {
    system: "Anti-spam",
    action: "Spam por webhook",
    author: message.author,
    channel: message.channel,
    fields: [
      ["Volume", code(`${flagged.length} mensagens em ${s.windowSec}s`)],
      ["Sinais", found.length ? found.join(", ") : "só volume"],
      ...(hook?.owner ? [["Webhook criado por", `<@${hook.owner.id}> — ${code(hook.owner.id)}`]] : []),
      ["Resultado", result],
    ],
    content: message.content,
  });
}

async function onMessage(message) {
  if (!message.guild || message.system) return;
  const isWebhook = !!message.webhookId;
  if (message.author.bot && !isWebhook) return;
  if (!isWebhook && !message.member) return;

  const cfg = await getAntiRaidConfig(message.guild.id);
  const s = cfg.spam;
  if (!s.enabled || (isWebhook && !s.includeWebhooks) || isExempt(message, s)) return;

  const key = `${message.guild.id}:${isWebhook ? `wh${message.webhookId}` : message.author.id}`;
  const now = Date.now();
  const state = states.get(key) ?? { entries: [], warns: 0, last: now };
  state.entries = state.entries.filter((e) => now - e.at < s.windowSec * 1000);
  state.entries.push({
    id: message.id,
    channelId: message.channelId,
    at: now,
    content: contentKey(message),
    mentions: mentionCount(message),
    invite: INVITE.test(message.content),
    link: LINK.test(message.content),
  });
  // (o texto das mensagens com anexo vem da assinatura de anexos acima)
  state.last = now;
  states.set(key, state);

  if (state.entries.length < s.limit) return;

  const found = detectSignals(state.entries, s);
  // "Exigir sinal" só protege contra falso positivo em conversa rápida: volume MUITO alto pune mesmo sem sinal
  // (spam com texto variado nunca repete mensagem, não tem link nem menção)
  if (s.requireSignal && !found.length && state.entries.length < s.limit * (s.volumeFactor || 2)) return;

  const flagged = state.entries;
  state.entries = [];

  if (isWebhook) {
    states.delete(key);
    return handleWebhookSpam(message, cfg, flagged, found);
  }

  if (s.deleteMessages) await deleteFlagged(message, flagged);

  // Ainda dentro dos avisos: só avisa, o aviso some sozinho
  if (state.warns < s.warnings) {
    state.warns++;
    const notice = await message.channel
      .send({
        components: [
          new ContainerBuilder()
            .setAccentColor(0xfaa61a)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `<@${message.author.id}>, você está enviando mensagens rápido demais. Aviso ${state.warns} de ${s.warnings}.`
              )
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { users: [message.author.id] },
      })
      .catch(() => null);
    if (notice) {
      suppressMessage(notice.id);
      setTimeout(() => notice.delete().catch(() => {}), s.warnSec * 1000);
    }
    return;
  }

  state.warns = 0;
  const ok = await message.member
    .timeout(s.timeoutMin * 60_000, "Anti-Raid: spam")
    .then(() => true)
    .catch(() => false);

  await sendModuleAlert(message.guild, cfg, s.alertChannelId, {
    system: "Anti-spam",
    action: "Spam detectado",
    author: message.author,
    channel: message.channel,
    fields: [
      ["Volume", code(`${flagged.length} mensagens em ${s.windowSec}s`)],
      ["Sinais", found.length ? found.join(", ") : "só volume"],
      ["Resultado", ok ? `timeout de ${s.timeoutMin} min aplicado` : "não consegui aplicar o timeout (cargo dele acima do meu?)"],
    ],
    content: message.content,
  });
}

// Limpa estados antigos para não crescer sem fim
const cleaner = setInterval(() => {
  const limit = Date.now() - 10 * 60_000;
  for (const [key, state] of states) if (state.last < limit) states.delete(key);
}, 5 * 60_000);
cleaner.unref?.();

module.exports = { onMessage };
