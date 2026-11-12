const { PermissionFlagsBits, MessageFlags, ContainerBuilder, TextDisplayBuilder } = require("discord.js");
const { getAntiRaidConfig } = require("./store");
const { sendModuleAlert } = require("./alert");
const { AL_TYPES, AL_PUNISH } = require("./defaults");
const { extractLinks, matchesAny, isResolvableInvite, findWrapped } = require("./linkTools");
const { suppressMessage } = require("../logs/suppress");
const { userBlock, channelBlock, codeBlock, code } = require("../logs/format");

// Anti-link: apaga mensagens com links proibidos conforme o painel.
// Padrão: só convites de outros servidores. Ordem de decisão para cada link:
//   1. domínio liberado        -> passa
//   2. domínio bloqueado       -> apaga
//   3. tipo liberado           -> passa
//   4. modo (convites / todos / tipos escolhidos) decide
//   5. convite do próprio servidor ou de servidor parceiro -> passa

// ---------- Consulta de convites (para saber de qual servidor é) ----------
const inviteCache = new Map(); // código -> { guildId, at, ttl }
const INVITE_TTL = 10 * 60_000; // convite válido
const INVALID_TTL = 2 * 60_000; // convite inválido ou expirado
const ERROR_TTL = 15_000; // falha momentânea (rede, limite de requisições)

async function resolveInviteGuild(client, code) {
  const hit = inviteCache.get(code);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.guildId;

  let guildId = null;
  let ttl = INVITE_TTL;
  try {
    const invite = await client.fetchInvite(code);
    guildId = invite.guild?.id ?? null;
  } catch (err) {
    ttl = err?.code === 10006 ? INVALID_TTL : ERROR_TTL;
  }

  if (inviteCache.size > 2000) inviteCache.clear();
  inviteCache.set(code, { guildId, at: Date.now(), ttl });
  return guildId;
}

// ---------- Decisão ----------
function isScoped(a, type) {
  if (a.mode === "all") return true;
  if (a.mode === "custom") return a.blockTypes.includes(type);
  return type === "invite"; // "invites" (padrão)
}

// Devolve um texto com o motivo se o link deve ser apagado, ou null se pode ficar
// canResolve = false: já consultei convites demais nesta mensagem (limite contra flood de consultas);
// o convite que sobrar não é resolvido e fica bloqueado (na dúvida, apaga).
async function judge(link, a, guild, canResolve = true) {
  if (matchesAny(a.allowedDomains, link)) return null;
  if (matchesAny(a.blockedDomains, link)) return "domínio bloqueado";
  if (a.allowedTypes.includes(link.type)) return null;
  if (!isScoped(a, link.type)) return null;

  if (canResolve && isResolvableInvite(link) && (a.allowOwnInvites || a.allowedGuilds.length)) {
    if (a.allowOwnInvites && guild.vanityURLCode && link.code.toLowerCase() === guild.vanityURLCode.toLowerCase()) return null;
    const guildId = await resolveInviteGuild(guild.client, link.code);
    if (guildId) {
      if (a.allowOwnInvites && guildId === guild.id) return null;
      if (a.allowedGuilds.some((g) => g.id === guildId)) return null;
    }
  }
  return AL_TYPES[link.type]?.label ?? "link";
}

// ---------- Exceções ----------
function isExempt(message, member, a) {
  const { guild, channel } = message;
  if (!member) {
    // webhook: não tem cargos nem permissões, só dá para isentar o canal
    return [channel.id, channel.parentId, channel.parent?.parentId].filter(Boolean).some((id) => a.exemptChannels.includes(id));
  }
  if (member.id === guild.ownerId || a.exemptUsers.includes(member.id)) return true;

  // canal, categoria do canal e, em threads, o canal pai e a categoria dele
  const places = [channel.id, channel.parentId, channel.parent?.parentId].filter(Boolean);
  if (places.some((id) => a.exemptChannels.includes(id))) return true;

  if (a.exemptRoles.length && member.roles.cache.hasAny(...a.exemptRoles)) return true;
  if (a.ignoreStaff && member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
  return false;
}

// ---------- Aviso e punição ----------
const strikes = new Map(); // "guild:user" -> [timestamps]
const noticeCooldown = new Map(); // "guild:user" -> timestamp
const permWarned = new Map(); // guildId -> timestamp
const NOTICE_GAP = 4_000;
const PERM_GAP = 10 * 60_000;

function joinNouns(types) {
  const nouns = [...new Set(types.map((t) => (t === "wrapped" ? "textos entre símbolos proibidos" : AL_TYPES[t]?.noun ?? "links")))];
  if (nouns.length <= 1) return nouns[0] ?? "links";
  return `${nouns.slice(0, -1).join(", ")} e ${nouns.at(-1)}`;
}

function renderMessage(template, userId, types) {
  return String(template || "{user}, não é permitido enviar {tipo} aqui.")
    .replaceAll("{user}", `<@${userId}>`)
    .replaceAll("{tipo}", joinNouns(types))
    .slice(0, 500);
}

async function sendNotice(message, a, types) {
  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();
  if (now - (noticeCooldown.get(key) ?? 0) < NOTICE_GAP) return;
  noticeCooldown.set(key, now);

  const notice = await message.channel
    .send({
      components: [
        new ContainerBuilder()
          .setAccentColor(0xed4245)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(renderMessage(a.message, message.author.id, types))),
      ],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { users: [message.author.id] },
    })
    .catch(() => null);
  if (notice) {
    suppressMessage(notice.id); // o aviso some sozinho e não vira "Mensagem apagada" nos logs
    setTimeout(() => notice.delete().catch(() => {}), (a.noticeSec || 8) * 1000);
  }
}

async function punish(member, a) {
  const reason = "Anti-Raid: links proibidos";
  try {
    if (a.punishment === "timeout") {
      if (!member.moderatable) return "não consegui silenciar (cargo dele acima do meu?)";
      await member.timeout(a.timeoutMin * 60_000, reason);
      return `timeout de ${a.timeoutMin} min aplicado`;
    }
    if (a.punishment === "kick") {
      if (!member.kickable) return "não consegui expulsar (cargo dele acima do meu?)";
      await member.kick(reason);
      return "membro expulso";
    }
    if (a.punishment === "ban") {
      if (!member.bannable) return "não consegui banir (cargo dele acima do meu?)";
      await member.ban({ reason, deleteMessageSeconds: 0 });
      return "membro banido";
    }
  } catch {
    return "o Discord recusou a punição";
  }
  return null;
}

// Conta mais uma infração e diz se passou do limite
function addStrike(message, a) {
  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();
  const list = (strikes.get(key) ?? []).filter((t) => now - t < a.strikeWindowMin * 60_000);
  list.push(now);
  if (list.length >= a.strikeLimit) {
    strikes.delete(key);
    return { count: list.length, reached: true };
  }
  strikes.set(key, list);
  return { count: list.length, reached: false };
}

const inline = (text, max = 90) => `\`${String(text).replace(/`/g, "'").slice(0, max)}\``;

// ---------- Texto da mensagem ----------
// Junta tudo o que pode carregar link: o texto, o conteúdo das mensagens ENCAMINHADAS (o Discord guarda
// em messageSnapshots e deixa o "content" vazio) e os links dos embeds. De webhook, também o texto dos
// embeds, que o autor escreve à mão. De pessoas comuns, a descrição de um embed NÃO entra: é o texto de
// outro site (um vídeo do YouTube com um convite na descrição não pode apagar a mensagem).
function collectText(message, isWebhook) {
  const parts = [message.content];

  const embedParts = (embeds, full) => {
    for (const e of embeds ?? []) {
      parts.push(e.url);
      if (!full) continue;
      parts.push(e.title, e.description, e.footer?.text, e.author?.name, e.author?.url);
      for (const f of e.fields ?? []) parts.push(f.name, f.value);
    }
  };

  embedParts(message.embeds, isWebhook);
  for (const snap of message.messageSnapshots?.values?.() ?? []) {
    parts.push(snap.content);
    embedParts(snap.embeds, isWebhook);
  }
  return parts.filter(Boolean).join("\n");
}

const MAX_LINKS = 80; // teto de links julgados por mensagem
const MAX_INVITE_LOOKUPS = 8; // consultas ao Discord por mensagem

// ---------- Entrada principal ----------
async function onMessage(message) {
  if (!message.guild || !message.author || message.system) return;
  const isWebhook = !!message.webhookId;
  if (message.author.bot && !isWebhook) return;

  const text = collectText(message, isWebhook);
  if (!text) return;

  const cfg = await getAntiRaidConfig(message.guild.id);
  const a = cfg.antiLink;
  if (!a.enabled || (isWebhook && !a.includeWebhooks)) return;

  const links = extractLinks(text, { bare: a.bareDomains });
  const angles = a.wrappers?.length ? findWrapped(text, a.wrappers) : [];
  if (!links.length && !angles.length) return;

  // Webhook não tem membro; para todo o resto o membro é necessário
  const member = isWebhook
    ? null
    : (message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null)));
  if (!isWebhook && !member) return;
  if (isExempt(message, member, a)) return;

  // Julga TODOS os links (até o teto), convites primeiro: antes só os 15 primeiros eram conferidos, e
  // bastava encher a mensagem de links liberados para esconder um convite no fim.
  links.sort((x, y) => Number(y.type === "invite") - Number(x.type === "invite"));
  const blocked = [];
  let lookups = 0;
  for (const link of links.slice(0, MAX_LINKS)) {
    const resolvable = isResolvableInvite(link);
    const why = await judge(link, a, message.guild, !resolvable || lookups < MAX_INVITE_LOOKUPS);
    if (resolvable) lookups++;
    if (why) blocked.push({ link, why });
  }
  if (links.length > MAX_LINKS) {
    blocked.push({ link: { raw: `${links.length - MAX_LINKS} link(s) a mais`, type: "other" }, why: "excesso de links na mesma mensagem" });
  }
  for (const raw of angles.slice(0, 5)) {
    blocked.push({ link: { raw, type: "wrapped" }, why: "texto entre símbolos" });
  }
  if (!blocked.length) return;

  const types = [...new Set(blocked.map((b) => b.link.type))];

  // 1) apaga
  let deleted = true;
  suppressMessage(message.id); // quem avisa é só o log do Anti-link, o log geral de mensagens fica quieto
  try {
    await message.delete();
  } catch (err) {
    if (err?.code === 10008) return; // já foi apagada (por outro módulo ou pela própria pessoa)
    deleted = false;
    const last = permWarned.get(message.guild.id) ?? 0;
    if (Date.now() - last > PERM_GAP) {
      permWarned.set(message.guild.id, Date.now());
      await sendModuleAlert(message.guild, cfg, a.alertChannelId, {
        system: "Anti-link",
        action: "Não consegui apagar",
        author: message.author,
        channel: message.channel,
        fields: [["Mensagem ID", code(message.id)], "O bot precisa de **Gerenciar mensagens** e **Ver canal** neste canal."],
        color: 0xed4245,
      });
    }
  }

  // 2) avisa
  if (deleted && a.notify) await sendNotice(message, a, types);

  // 3) conta a infração e pune se passou do limite
  let punishment = null;
  let count = 0;
  if (deleted && a.punishment !== "none" && member) {
    const strike = addStrike(message, a);
    count = strike.count;
    if (strike.reached && member) punishment = await punish(member, a);
  }

  // 4) registra
  if (a.logEnabled && deleted) {
    const shown = blocked.slice(0, 4).map((b) => `${inline(b.link.raw)} · ${b.why}`);
    if (blocked.length > 4) shown.push(`e mais ${blocked.length - 4} link(s)`);
    await sendModuleAlert(message.guild, cfg, a.alertChannelId, {
      system: "Anti-link",
      action: "Mensagem apagada",
      author: message.author,
      channel: message.channel,
      fields: [
        ["Mensagem ID", code(message.id)],
        ["Motivo", shown.join("\n")],
        ...(a.punishment !== "none"
          ? [["Infrações", `${code(`${count} de ${a.strikeLimit}`)} (${AL_PUNISH[a.punishment].label.toLowerCase()})`]]
          : []),
        ...(punishment ? [["Punição", punishment]] : []),
      ],
      content: text,
    });
  }
}

// Limpa estados antigos para não crescer sem fim
const cleaner = setInterval(() => {
  const now = Date.now();
  for (const [key, list] of strikes) if (!list.length || now - list.at(-1) > 3 * 3600_000) strikes.delete(key);
  for (const [key, at] of noticeCooldown) if (now - at > 60_000) noticeCooldown.delete(key);
  for (const [code, hit] of inviteCache) if (now - hit.at > hit.ttl) inviteCache.delete(code);
}, 5 * 60_000);
cleaner.unref?.();

module.exports = { onMessage, judge, resolveInviteGuild };
