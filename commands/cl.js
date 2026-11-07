const { ChannelType, PermissionFlagsBits } = require("discord.js");
const { getClConfig, canUseCl } = require("../utils/cl/store");
const { suppressMessage, clearSuppressed } = require("../utils/logs/suppress");
const { activeCategory, deliver } = require("../utils/logs/send");
const { COLORS, userBlock, channelBlock, code } = require("../utils/logs/format");

const DAY14 = 14 * 24 * 60 * 60 * 1000;
const BULK_LIMIT = DAY14 - 5 * 60 * 1000; // margem de segurança do bulkDelete (14 dias)

const running = new Set(); // "guildId:userId" executando agora
const lastUse = new Map(); // "guildId:userId" -> timestamp do último uso

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const REQUIRED = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ReadMessageHistory,
];

// 1m 05s
function formatDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

async function notice(channel, content, seconds = 5) {
  const sent = await channel.send({ content, allowedMentions: { parse: [] } }).catch(() => null);
  if (sent) {
    suppressMessage(sent.id);
    setTimeout(() => sent.delete().catch(() => {}), seconds * 1000);
  }
}

// Procura (do mais novo para o mais antigo) as mensagens do usuário no canal
async function collect(channel, userId, cfg, limit, skipId) {
  const found = [];
  const minTs = cfg.includeOld ? 0 : Date.now() - BULK_LIMIT;
  let before;
  let scanned = 0;

  while (scanned < cfg.scanLimit && found.length < limit) {
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch?.size) break;
    scanned += batch.size;
    before = batch.last().id;

    let reachedOld = false;
    for (const msg of batch.values()) {
      if (msg.createdTimestamp < minTs) {
        reachedOld = true;
        break;
      }
      if (msg.id === skipId || msg.author?.id !== userId) continue;
      if (cfg.skipPinned && msg.pinned) continue;
      found.push(msg);
      if (found.length >= limit) break;
    }
    if (reachedOld || batch.size < 100) break;
  }
  return found;
}

// Apaga em lote (instantâneo) o que tem menos de 14 dias e uma a uma o que for mais antigo
async function remove(channel, messages) {
  let deleted = 0;
  const fresh = messages.filter((m) => m.createdTimestamp > Date.now() - BULK_LIMIT);
  const old = messages.filter((m) => m.createdTimestamp <= Date.now() - BULK_LIMIT);

  for (let i = 0; i < fresh.length; i += 100) {
    const chunk = fresh.slice(i, i + 100);
    if (chunk.length === 1) {
      deleted += (await chunk[0].delete().then(() => 1).catch(() => 0));
      continue;
    }
    const result = await channel.bulkDelete(chunk.map((m) => m.id), true).catch(() => null);
    if (result) {
      deleted += result.size;
    } else {
      for (const msg of chunk) deleted += await msg.delete().then(() => 1).catch(() => 0);
    }
  }

  for (const msg of old) deleted += await msg.delete().then(() => 1).catch(() => 0);
  return deleted;
}

function targetChannels(message, cfg) {
  if (cfg.scope !== "guild") return [message.channel];
  const me = message.guild.members.me;
  const others = [...message.guild.channels.cache.values()].filter(
    (c) =>
      c.id !== message.channel.id &&
      [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(c.type) &&
      !cfg.blockedChannels.includes(c.id) &&
      c.permissionsFor(me)?.has(REQUIRED)
  );
  return [message.channel, ...others]; // o canal atual vem primeiro
}

async function sendLog({ message, cfg, results, total, startedAt }) {
  if (!cfg.sendLog || !total) return;
  const guild = message.guild;
  const category = await activeCategory(guild, "mensagens");
  if (!category) return;

  const info = [
    channelBlock(message.channel, "Usado em"),
    `**Total de mensagens apagadas:** ${code(total)}`,
    `**Alcance:** ${code(cfg.scope === "guild" ? "Todos os canais" : "Canal atual")}`,
    `**Duração:** ${code(formatDuration(Date.now() - startedAt))}`,
  ];
  const groups = [[userBlock(message.author, "Executado por")], info];

  if (cfg.scope === "guild") {
    const lines = results.filter((r) => r.deleted).slice(0, 8).map((r) => `<#${r.channel.id}> (${r.deleted})`);
    if (lines.length) groups.push([`**Canais afetados (${results.filter((r) => r.deleted).length}):** ${lines.join(" ")}`]);
  }

  await deliver(guild, category, {
    title: `Limpeza pelo comando cl — ${guild.name}`,
    color: COLORS.red,
    thumbnail: message.author.displayAvatarURL(),
    groups,
  });
}

module.exports = {
  name: "cl",
  async execute(message) {
    const { guild, channel, member, author } = message;
    if (!guild || !member) return;

    const cfg = await getClConfig(guild.id);
    if (!cfg.enabled) return; // "cl" é uma palavra comum: sem permissão ou desativado, ignora em silêncio
    const verdict = canUseCl(cfg, member, channel);
    if (!verdict.ok) return;

    const key = `${guild.id}:${author.id}`;

    // Já tem uma limpeza em andamento: só some com o "cl" repetido
    if (running.has(key)) {
      suppressMessage(message.id);
      message.delete().catch(() => {});
      return;
    }

    // Tempo de espera entre usos (administradores e cargos isentos não esperam)
    const exempt =
      verdict.admin ||
      (cfg.cooldownExemptRoles.length > 0 && member.roles.cache.hasAny(...cfg.cooldownExemptRoles));
    if (cfg.cooldown && !exempt) {
      const left = (lastUse.get(key) ?? 0) + cfg.cooldown * 1000 - Date.now();
      if (left > 0) {
        suppressMessage(message.id);
        message.delete().catch(() => {});
        return notice(channel, `<@${author.id}> aguarde **${Math.ceil(left / 1000)}s** para usar o \`cl\` de novo.`, 4);
      }
    }

    if (!channel.permissionsFor(guild.members.me)?.has(REQUIRED)) {
      return notice(
        channel,
        "Preciso das permissões **Gerenciar Mensagens** e **Ver histórico de mensagens** neste canal.",
        6
      );
    }

    running.add(key);
    lastUse.set(key, Date.now());
    const startedAt = Date.now();
    const allIds = [message.id];

    try {
      // 1) o próprio "cl" some na hora
      suppressMessage(message.id);
      if (cfg.deleteTrigger) message.delete().catch(() => {});

      // 2) depois todas as mensagens da pessoa
      const results = [];
      let total = 0;
      let remaining = cfg.amount > 0 ? cfg.amount : Infinity;

      for (const target of targetChannels(message, cfg)) {
        if (remaining <= 0) break;
        const found = await collect(target, author.id, cfg, remaining, message.id);
        if (!found.length) continue;

        found.forEach((m) => suppressMessage(m.id)); // não gera "Mensagem apagada" individual
        allIds.push(...found.map((m) => m.id));

        const deleted = await remove(target, found);
        results.push({ channel: target, deleted });
        total += deleted;
        remaining -= deleted;
        if (target.id !== channel.id) await sleep(300); // respiro entre canais
      }

      await sendLog({ message, cfg, results, total, startedAt }).catch((err) =>
        console.error("[CL] Erro ao enviar log:", err)
      );

      if (cfg.notice) {
        await notice(
          channel,
          `<@${author.id}> **${total}** mensagem(ns) apagada(s) em ${formatDuration(Date.now() - startedAt)}.`,
          cfg.noticeSeconds
        );
      }
    } catch (err) {
      console.error("[CL] Erro ao limpar mensagens:", err);
    } finally {
      running.delete(key);
      clearSuppressed(allIds);
    }
  },
};
