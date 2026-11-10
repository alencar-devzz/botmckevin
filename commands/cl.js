const { ChannelType, PermissionFlagsBits } = require("discord.js");
const { getClConfig, canUseCl } = require("../utils/cl/store");
const { suppressMessage, clearSuppressed } = require("../utils/logs/suppress");
const { activeCategory, deliver } = require("../utils/logs/send");
const { COLORS, userBlock, channelBlock, code } = require("../utils/logs/format");

const DAY14 = 14 * 24 * 60 * 60 * 1000;
const BULK_LIMIT = DAY14 - 5 * 60 * 1000; // margem de segurança do bulkDelete (14 dias)

const running = new Set(); // "guildId:userId" executando agora
const lastUse = new Map(); // "guildId:userId" -> timestamp do último uso

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

// Roda fn em todos os itens, no máximo `limit` ao mesmo tempo
async function mapLimit(list, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length) await fn(list[next++]);
  });
  await Promise.all(workers);
}

const deleteOne = (msg) => msg.delete().then(() => 1).catch(() => 0);

// Apaga em lote (instantâneo) o que tem menos de 14 dias e, em paralelo, o que for mais antigo (um a um, vários ao mesmo tempo).
// Todos os pedidos saem juntos: a fila de limite de taxa do discord.js organiza o resto.
async function remove(channel, messages) {
  const limit = Date.now() - BULK_LIMIT;
  const fresh = messages.filter((m) => m.createdTimestamp > limit);
  const old = messages.filter((m) => m.createdTimestamp <= limit);
  let deleted = 0;
  const jobs = [];

  for (let i = 0; i < fresh.length; i += 100) {
    const chunk = fresh.slice(i, i + 100);
    jobs.push(
      (async () => {
        if (chunk.length === 1) return deleteOne(chunk[0]);
        const result = await channel.bulkDelete(chunk.map((m) => m.id), true).catch(() => null);
        if (result) return result.size;
        let n = 0; // o lote falhou: apaga uma a uma, várias ao mesmo tempo
        await mapLimit(chunk, 6, async (m) => {
          n += await deleteOne(m);
        });
        return n;
      })().then((n) => {
        deleted += n;
      })
    );
  }
  if (old.length) {
    jobs.push(
      mapLimit(old, 6, async (m) => {
        deleted += await deleteOne(m);
      })
    );
  }

  await Promise.all(jobs);
  return deleted;
}

// Varre o canal (do mais novo para o mais antigo) apagando as mensagens da pessoa ENQUANTO busca a próxima página:
// a busca e a exclusão andam juntas em vez de uma esperar a outra.
// budget = { remaining } é compartilhado entre os canais (limite de quantidade do painel).
async function sweep(channel, userId, cfg, budget, skipId, ids) {
  const minTs = cfg.includeOld ? 0 : Date.now() - BULK_LIMIT;
  const pending = [];
  const seen = new Set();
  let deleted = 0;

  const launch = (list) => {
    if (!list.length) return;
    list.forEach((m) => {
      seen.add(m.id);
      suppressMessage(m.id); // não gera "Mensagem apagada" individual
      ids.push(m.id);
    });
    pending.push(
      remove(channel, list).then((n) => {
        deleted += n;
        budget.remaining += list.length - n; // o que não foi apagado volta para o limite
      })
    );
  };

  const mine = (msg) =>
    msg.id !== skipId && msg.author?.id === userId && !(cfg.skipPinned && msg.pinned) && !seen.has(msg.id);

  // Sem limite de quantidade: o que o bot já tem em memória começa a ser apagado agora, sem esperar a busca
  if (budget.remaining === Infinity) {
    const cached = [...channel.messages.cache.values()].filter((m) => m.createdTimestamp >= minTs && mine(m));
    launch(cached);
  }

  let scanned = 0;
  let page = channel.messages.fetch({ limit: 100 }).catch(() => null);

  while (budget.remaining > 0) {
    const batch = await page;
    if (!batch?.size) break;
    scanned += batch.size;

    let reachedOld = false;
    const found = [];
    for (const msg of batch.values()) {
      if (msg.createdTimestamp < minTs) {
        reachedOld = true;
        break;
      }
      if (mine(msg)) found.push(msg);
    }

    const take = found.slice(0, budget.remaining);
    budget.remaining -= take.length;

    const more = !reachedOld && batch.size >= 100 && scanned < cfg.scanLimit && budget.remaining > 0;
    if (more) page = channel.messages.fetch({ limit: 100, before: batch.last().id }).catch(() => null); // já busca a próxima
    launch(take);
    if (!more) break;
  }

  await Promise.all(pending);
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
      const budget = { remaining: cfg.amount > 0 ? cfg.amount : Infinity };
      const channels = targetChannels(message, cfg);

      const run = async (target, index) => {
        const deleted = await sweep(target, author.id, cfg, budget, message.id, allIds);
        total += deleted;
        if (deleted) results.push({ channel: target, deleted, index });
      };

      if (budget.remaining === Infinity) {
        // sem limite de quantidade: todos os canais ao mesmo tempo (vários por vez)
        await mapLimit(channels.map((c, i) => [c, i]), 6, ([c, i]) => run(c, i));
      } else {
        // com limite: o canal atual vem primeiro, para a quantidade valer do mais novo para o mais antigo
        await run(channels[0], 0);
        await mapLimit(channels.slice(1).map((c, i) => [c, i + 1]), 6, async ([c, i]) => {
          if (budget.remaining > 0) await run(c, i);
        });
      }
      results.sort((x, y) => x.index - y.index);

      // log e aviso saem juntos
      const tasks = [
        sendLog({ message, cfg, results, total, startedAt }).catch((err) => console.error("[CL] Erro ao enviar log:", err)),
      ];
      if (cfg.notice) {
        tasks.push(
          notice(
            channel,
            `<@${author.id}> **${total}** mensagem(ns) apagada(s) em ${formatDuration(Date.now() - startedAt)}.`,
            cfg.noticeSeconds
          )
        );
      }
      await Promise.all(tasks);
    } catch (err) {
      console.error("[CL] Erro ao limpar mensagens:", err);
    } finally {
      running.delete(key);
      clearSuppressed(allIds);
    }
  },
};
