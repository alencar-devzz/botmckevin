const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");
const { getPrefix } = require("../utils/getPrefix");
const { formatDuration } = require("../utils/formatDuration");
const { buildLimpandoPanel, buildLimpoPanel } = require("../ui/limpar");

const MAX_MESSAGES = 500;
const DELETE_DELAY_MS = 2000; // espera entre cada mensagem apagada (evita rate limit)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

    const panel = await channel.send({
      components: buildLimpandoPanel({
        channel,
        deleted,
        total,
        elapsed: formatDuration(0),
      }),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });

    const refresh = () =>
      panel
        .edit({
          components: buildLimpandoPanel({
            channel,
            deleted,
            total,
            elapsed: formatDuration(Date.now() - startedAt),
          }),
          flags: MessageFlags.IsComponentsV2,
          allowedMentions: { parse: [] },
        })
        .catch(() => {});

    try {
      while (deleted < total) {
        const remaining = total - deleted;

        // +1 porque o próprio painel pode vir junto no fetch
        const fetched = await channel.messages.fetch({ limit: Math.min(100, remaining + 1) });
        const batch = fetched.filter((m) => m.id !== panel.id).first(remaining);
        if (batch.length === 0) break;

        const before = deleted;

        // Apaga uma por vez, esperando 2 segundos entre cada deleção
        for (const msg of batch) {
          const ok = await msg.delete().then(() => true).catch(() => false);
          if (!ok) continue;

          deleted++;
          await refresh();

          if (deleted < total) await sleep(DELETE_DELAY_MS);
        }

        // Nada foi apagado nessa rodada: para para não ficar em loop
        if (deleted === before) break;
      }
    } catch (err) {
      console.error("[LIMPAR] Erro ao limpar canal:", err);
    }

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
