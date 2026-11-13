const { ChannelType, PermissionFlagsBits } = require("discord.js");
const { buildNukeMessage } = require("./render");
const { migrateChannelId } = require("./migrate");
const { suppressChannelDelete, suppressChannelCreate } = require("../logs/suppress");
const { activeCategory, deliver } = require("../logs/send");
const { COLORS, userBlock, channelBlock, code } = require("../logs/format");

// Só canais de texto e de anúncios podem ser recriados (têm mensagens e a mensagem de aviso vai neles)
const NUKEABLE = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

const running = new Set(); // canais sendo recriados agora
const lastUse = new Map(); // "guildId:userId" -> timestamp do último uso

// Por que este canal não pode ser recriado? Retorna o texto do motivo, ou null se pode
function nukeBlocker(channel) {
  if (!NUKEABLE.includes(channel.type)) return "Só dá para recriar canais de texto e de anúncios.";
  const { guild } = channel;
  if (channel.id === guild.rulesChannelId || channel.id === guild.publicUpdatesChannelId) {
    return "Esse canal é obrigatório para servidores de comunidade e não pode ser recriado.";
  }
  const me = guild.members.me;
  const perms = channel.permissionsFor(me);
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels])) {
    return "Preciso da permissão **Gerenciar canais** neste canal para recriá-lo.";
  }
  return null;
}

function cooldownLeft(cfg, member, admin) {
  if (!cfg.cooldown || admin) return 0;
  const key = `${member.guild.id}:${member.id}`;
  return Math.max(0, (lastUse.get(key) ?? 0) + cfg.cooldown * 1000 - Date.now());
}

// 1m 05s
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const total = Math.round(ms / 100) / 10;
  return total < 60 ? `${total}s` : `${Math.floor(total / 60)}m ${String(Math.round(total % 60)).padStart(2, "0")}s`;
}

async function sendNukeLog({ guild, executor, oldChannel, newChannel, startedAt, migrated }) {
  const category = await activeCategory(guild, "canais");
  if (!category) return;
  await deliver(guild, category, {
    title: `Canal nukado — ${guild.name}`,
    color: COLORS.red,
    thumbnail: executor.displayAvatarURL(),
    groups: [
      [userBlock(executor.user ?? executor, "Executado por")],
      [
        channelBlock(newChannel, "Canal novo"),
        `**Canal antigo:** ${code(`#${oldChannel.name}`)} (${code(oldChannel.id)})`,
        `**Categoria:** ${oldChannel.parent?.name ?? "Nenhuma"}`,
        `**Duração:** ${code(formatDuration(Date.now() - startedAt))}`,
        ...(migrated ? [`**Configurações do bot atualizadas:** ${code(migrated)}`] : []),
      ],
    ],
  });
}

// Recria o canal e troca pelo novo.
// Ordem: 1) cria o novo (igual ao antigo)  2) EM PARALELO: apaga o antigo (depois troca os IDs nas configurações) e envia a mensagem.
// Se a criação falhar nada é apagado; se o antigo não puder ser apagado, o novo é desfeito.
// Retorna { ok: true, channel } ou { ok: false, error }
async function nukeChannel({ channel, member, cfg }) {
  const { guild } = channel;
  if (running.has(channel.id)) return { ok: false, error: "Esse canal já está sendo recriado." };
  running.add(channel.id);
  lastUse.set(`${guild.id}:${member.id}`, Date.now());

  const startedAt = Date.now();
  const reason = `nnuke: canal recriado por ${member.user?.tag ?? member.user?.username ?? member.id}`;
  const isText = channel.type === ChannelType.GuildText;

  try {
    // Os logs automáticos de "canal criado/excluído" dão lugar a um log só (sendNukeLog)
    suppressChannelDelete(channel.id);
    suppressChannelCreate(guild.id, channel.name, channel.parentId);

    const options = {
      name: channel.name,
      type: channel.type,
      parent: channel.parentId ?? undefined,
      position: channel.rawPosition,
      topic: channel.topic ?? undefined,
      nsfw: channel.nsfw,
      defaultAutoArchiveDuration: channel.defaultAutoArchiveDuration ?? undefined,
      permissionOverwrites: channel.permissionOverwrites.cache.map((o) => ({
        id: o.id,
        type: o.type,
        allow: o.allow,
        deny: o.deny,
      })),
      reason,
    };
    if (isText) {
      options.rateLimitPerUser = channel.rateLimitPerUser ?? 0;
      options.defaultThreadRateLimitPerUser = channel.defaultThreadRateLimitPerUser ?? undefined;
    }

    let fresh;
    try {
      fresh = await guild.channels.create(options);
    } catch (err) {
      console.error("[NUKE] Erro ao criar o canal novo:", err);
      return { ok: false, error: "Não consegui criar o canal novo. Verifique as minhas permissões." };
    }

    const payload = buildNukeMessage(cfg, {
      guild,
      executor: member,
      channel: fresh,
      oldChannelId: channel.id,
      categoryName: channel.parent?.name ?? "Nenhuma",
      now: new Date(),
    });

    // Tudo ao mesmo tempo: apagar o antigo (e, só depois que ele sumiu, trocar os IDs nas configurações) + enviar a mensagem.
    // Os IDs só mudam depois do delete dar certo: se o delete falhar, o novo é desfeito e nada fica apontando para ele.
    const removal = channel.delete(reason).then(async () => {
      const [migrated] = await Promise.allSettled([
        cfg.migrate ? migrateChannelId(guild.id, channel.id, fresh.id) : Promise.resolve(0),
        guild.systemChannelId === channel.id ? guild.setSystemChannel(fresh, reason) : Promise.resolve(null),
      ]);
      return migrated.status === "fulfilled" ? migrated.value : 0;
    });
    const [deleted, sent] = await Promise.allSettled([
      removal,
      fresh.send(payload).then((msg) => {
        if (cfg.pin) msg.pin().catch(() => {});
        if (cfg.autoDeleteSeconds) setTimeout(() => msg.delete().catch(() => {}), cfg.autoDeleteSeconds * 1000);
        return msg;
      }),
    ]);

    if (deleted.status === "rejected") {
      // O antigo continua lá: desfaz o novo para não ficar canal duplicado
      console.error("[NUKE] Erro ao apagar o canal antigo:", deleted.reason);
      await fresh.delete("nnuke: desfeito (não foi possível apagar o canal antigo)").catch(() => {});
      return { ok: false, error: "Não consegui apagar o canal antigo, então nada foi alterado." };
    }
    if (sent.status === "rejected") console.error("[NUKE] Erro ao enviar a mensagem no canal novo:", sent.reason?.message ?? sent.reason);

    if (cfg.sendLog) {
      sendNukeLog({
        guild,
        executor: member,
        oldChannel: channel,
        newChannel: fresh,
        startedAt,
        migrated: deleted.value,
      }).catch((err) => console.error("[NUKE] Erro ao enviar log:", err));
    }

    return { ok: true, channel: fresh };
  } finally {
    running.delete(channel.id);
  }
}

module.exports = { nukeChannel, nukeBlocker, cooldownLeft, formatDuration, NUKEABLE };
