const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");
const { getPrefix } = require("../utils/getPrefix");
const { buildLimpandoPanel, buildLimpoPanel } = require("../ui/limparPanel");
const { activeCategory, deliver } = require("../utils/logs/send");
const { suppressMessage, clearSuppressed } = require("../utils/logs/suppress");
const { COLORS, channelBlock, code } = require("../utils/logs/format");

const MAX_MESSAGES = 500;
const DELETE_DELAY_MS = 1000; // 1 segundo entre cada mensagem apagada
const REFRESH_EVERY_MS = 5000; // o painel só se atualiza a cada 5 segundos

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 1m 05s
function formatDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

// Um único log para a limpeza inteira (em vez de um "Mensagem apagada" por mensagem)
async function sendCleanupLog({ message, channel, deletedIds, authors, total, startedAt }) {
  if (!deletedIds.length) return;
  const guild = message.guild;
  const cfg = await activeCategory(guild, "mensagens");
  if (!cfg) return;

  const authorCount = authors.size;
  const topAuthors = [...authors.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, n]) => `<@${id}> (${n})`);

  const info = [
    `**Executado por:** <@${message.author.id}> — ${code(message.author.username)} (${code(message.author.id)})`,
    channelBlock(channel),
    `**Total de mensagens apagadas:** ${code(deletedIds.length)}`,
    `**Quantidade solicitada:** ${code(total)}`,
    `**Duração:** ${code(formatDuration(Date.now() - startedAt))}`,
  ];
  if (deletedIds.length < total) {
    info.push(`**Não apagadas:** ${code(total - deletedIds.length)} (acabaram ou não foi possível apagar)`);
  }

  const groups = [[info[0]], info.slice(1)];
  if (authorCount) {
    groups.push([`**Autores afetados (${authorCount}):** ${topAuthors.join(" ")}${authorCount > 5 ? " …" : ""}`]);
  }

  await deliver(guild, cfg, {
    title: `Limpeza por comando — ${guild.name}`,
    color: COLORS.red,
    thumbnail: message.author.displayAvatarURL(),
    groups,
  });
}

// Envia um aviso no canal e apaga depois de 5s
async function aviso(message, content) {
  const warning = await message.channel.send(content).catch(() => null);
  setTimeout(() => warning?.delete().catch(() => {}), 5000);
}

module.exports = {
  name: "limpar",
  aliases: ["clear"],
  async execute(message, args) {
    // Apenas os cargos da equipe podem usar o comando
    if (!message.member.roles.cache.hasAny(...ALL_STAFF_ROLE_IDS)) {
      return aviso(message, "Você não tem permissão para usar esse comando.");
    }

    const prefix = await getPrefix(message.guild.id);
    const total = Number(args[0]);

    if (!Number.isInteger(total) || total < 1) {
      return aviso(message, `Use: \`${prefix}limpar <1-${MAX_MESSAGES}>\` (exemplo: \`${prefix}limpar 12\`).`);
    }
    if (total > MAX_MESSAGES) {
      return aviso(message, `O máximo é de ${MAX_MESSAGES} mensagens por vez.`);
    }

    const channel = message.channel;
    const me = message.guild.members.me;
    const perms = channel.permissionsFor(me);
    if (
      !perms?.has(PermissionFlagsBits.ManageMessages) ||
      !perms?.has(PermissionFlagsBits.ReadMessageHistory)
    ) {
      return aviso(message, "Preciso das permissões **Gerenciar Mensagens** e **Ver histórico de mensagens** neste canal.");
    }

    const startedAt = Date.now();
    let deleted = 0;
    const deletedIds = [];
    const authors = new Map(); // autorId -> quantidade de mensagens apagadas

    const panel = await channel.send({
      components: buildLimpandoPanel({
        channel,
        deleted,
        total,
        startedAt,
      }),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });

    suppressMessage(panel.id); // o painel temporário do comando também não vira log
    let lastRefresh = Date.now(); // a primeira atualização vem 5s depois de iniciar
    const refresh = (force = false) => {
      const now = Date.now();
      if (!force && now - lastRefresh < REFRESH_EVERY_MS) return Promise.resolve();
      lastRefresh = now;
      return panel
        .edit({
          components: buildLimpandoPanel({
            channel,
            deleted,
            total,
            startedAt,
          }),
          flags: MessageFlags.IsComponentsV2,
          allowedMentions: { parse: [] },
        })
        .catch(() => {});
    };

    try {
      while (deleted < total) {
        const remaining = total - deleted;

        // +1 porque o próprio painel pode vir junto no fetch
        const fetched = await channel.messages.fetch({ limit: Math.min(100, remaining + 1) });
        const batch = fetched.filter((m) => m.id !== panel.id).first(remaining);
        if (batch.length === 0) break;

        const before = deleted;

        // Apaga uma por vez, com uma pequena espera entre cada deleção
        for (const msg of batch) {
          suppressMessage(msg.id); // não gera "Mensagem apagada" individual
          const ok = await msg.delete().then(() => true).catch(() => false);
          if (!ok) continue;

          deleted++;
          deletedIds.push(msg.id);
          if (msg.author) authors.set(msg.author.id, (authors.get(msg.author.id) ?? 0) + 1);
          refresh(); // sem await: a atualização do painel não segura a próxima deleção

          if (deleted < total) await sleep(DELETE_DELAY_MS);
        }

        // Nada foi apagado nessa rodada: para para não ficar em loop
        if (deleted === before) break;
      }
    } catch (err) {
      console.error("[LIMPAR] Erro ao limpar canal:", err);
    }

    clearSuppressed(deletedIds);
    await sendCleanupLog({ message, channel, deletedIds, authors, total, startedAt }).catch((err) =>
      console.error("[LIMPAR] Erro ao enviar log da limpeza:", err)
    );

    await panel
      .edit({
        components: buildLimpoPanel({ channel, userId: message.author.id }),
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
      })
      .catch(() => {});

    // O painel se apaga sozinho 5 segundos depois de concluir
    setTimeout(() => panel.delete().catch(() => {}), 5000);
  },
};
