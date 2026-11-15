const {
  ChannelType,
  ChannelFlags,
  OverwriteType,
  PermissionFlagsBits,
  PermissionsBitField,
} = require("discord.js");

const MAX_GUILD_CHANNELS = 500;

// Tipos de canal que dá para copiar
const TYPE_INFO = {
  [ChannelType.GuildText]: { key: "text", emoji: "💬", label: "Texto" },
  [ChannelType.GuildAnnouncement]: { key: "announcement", emoji: "📢", label: "Anúncios" },
  [ChannelType.GuildVoice]: { key: "voice", emoji: "🔊", label: "Voz" },
  [ChannelType.GuildStageVoice]: { key: "stage", emoji: "🎙️", label: "Palco" },
  [ChannelType.GuildForum]: { key: "forum", emoji: "🗂️", label: "Fórum" },
  [ChannelType.GuildMedia]: { key: "media", emoji: "🖼️", label: "Mídia" },
};

const VOICE_TYPES = new Set([ChannelType.GuildVoice, ChannelType.GuildStageVoice]);
const THREAD_PARENT_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
]);
const FORUM_TYPES = new Set([ChannelType.GuildForum, ChannelType.GuildMedia]);

// Bits de flags de canal copiados dos fóruns/mídia (exigir tag, esconder opções de download)
const FORUM_FLAGS = (ChannelFlags?.RequireTag ?? 16) | (ChannelFlags?.HideMediaDownloadOptions ?? 32768);

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Canais da categoria na ordem em que aparecem no Discord (texto primeiro, depois voz)
function categoryChildren(category) {
  return [...category.children.cache.values()]
    .filter((channel) => TYPE_INFO[channel.type])
    .sort((a, b) => Number(VOICE_TYPES.has(a.type)) - Number(VOICE_TYPES.has(b.type)) || a.rawPosition - b.rawPosition);
}

// Canais que serão copiados: tipo ligado e não excluído na lista
function plannedChannels(state, category) {
  return categoryChildren(category).filter(
    (channel) => state.types.has(TYPE_INFO[channel.type].key) && !state.excluded.has(channel.id)
  );
}

// Nome do canal na cópia (com "trocar texto", se configurado)
function newChannelName(channel, state) {
  if (!state.find) return channel.name;
  const name = channel.name.replace(new RegExp(escapeRegex(state.find), "gi"), state.replace ?? "").slice(0, 100);
  return name.trim() ? name : channel.name;
}

function copyName(state, index) {
  const base = (state.newName || "Categoria").slice(0, 96);
  return state.copies > 1 ? `${base} ${index + 1}` : base;
}

// Resumo da categoria original (tela inicial)
function describeCategory(category) {
  const children = categoryChildren(category);
  const counts = {};
  for (const channel of children) counts[channel.type] = (counts[channel.type] ?? 0) + 1;
  const ownPerms = children.filter((c) => c.permissionOverwrites.cache.size > 0).length;
  return {
    total: children.length,
    counts,
    categoryOverwrites: category.permissionOverwrites.cache.size,
    channelsWithOwnPerms: ownPerms,
    unsupported: category.children.cache.size - children.length,
  };
}

function missingBotBits(guild, state, source, planned) {
  const bot = guild.members.me;
  if (!bot || bot.permissions.has(PermissionFlagsBits.Administrator)) return 0n;
  let used = 0n;
  const add = (channel) => {
    for (const o of channel.permissionOverwrites.cache.values()) used |= o.allow.bitfield | o.deny.bitfield;
  };
  if (state.items.has("catPerms")) add(source);
  if (state.items.has("chanPerms")) planned.forEach(add);
  return used & ~bot.permissions.bitfield;
}

// Confere tudo antes de duplicar: o que bloqueia e o que só merece aviso
async function reviewInfo(state, guild) {
  const source = guild.channels.cache.get(state.sourceId);
  const bot = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  const planned = source ? plannedChannels(state, source) : [];
  const blocking = [];
  const warnings = [];

  if (!source) blocking.push("A categoria original não existe mais. Volte e escolha outra.");

  if (!bot?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    blocking.push("Eu preciso da permissão **Gerenciar canais** para criar a cópia.");
  }

  const toCreate = (planned.length + 1) * state.copies;
  if (guild.channels.cache.size + toCreate > MAX_GUILD_CHANNELS) {
    blocking.push(
      `O servidor passaria do limite de ${MAX_GUILD_CHANNELS} canais (hoje: ${guild.channels.cache.size}, a cópia criaria ${toCreate}).`
    );
  }

  if (source && !bot?.permissions.has(PermissionFlagsBits.Administrator)) {
    const wantsPerms = state.items.has("catPerms") || state.items.has("chanPerms");
    if (wantsPerms && !bot?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      warnings.push("Não tenho **Gerenciar cargos** nem **Administrador**: o Discord pode recusar parte das permissões.");
    }
    const missing = missingBotBits(guild, state, source, planned);
    if (missing) {
      const names = new PermissionsBitField(missing).toArray();
      warnings.push(
        `As permissões copiadas usam itens que eu não tenho (${names.slice(0, 5).join(", ")}${names.length > 5 ? "…" : ""}). Elas serão omitidas na cópia.`
      );
    }
  }

  if (source) {
    const unsupported = source.children.cache.size - categoryChildren(source).length;
    if (unsupported > 0) warnings.push(`${unsupported} canal(is) de tipo não suportado serão ignorados.`);
  }

  return { source, planned, toCreate, blocking, warnings };
}

// Permissões (cargos e membros) de um canal, prontas para criar o novo.
// Membros que saíram do servidor e bits que o bot não tem são tirados (e contados em ctx).
async function buildOverwrites(source, guild, ctx) {
  const bot = guild.members.me;
  const mask = !bot || bot.permissions.has(PermissionFlagsBits.Administrator) ? null : bot.permissions.bitfield;
  const list = [];

  for (const o of source.permissionOverwrites.cache.values()) {
    if (o.type === OverwriteType.Member) {
      if (!ctx.members.has(o.id)) {
        const member = guild.members.cache.get(o.id) ?? (await guild.members.fetch(o.id).catch(() => null));
        ctx.members.set(o.id, Boolean(member));
      }
      if (!ctx.members.get(o.id)) {
        ctx.skippedMembers++;
        continue;
      }
    } else if (!guild.roles.cache.has(o.id)) {
      ctx.skippedRoles++;
      continue;
    }

    let allow = o.allow.bitfield;
    let deny = o.deny.bitfield;
    if (mask !== null) {
      const maskedAllow = allow & mask;
      const maskedDeny = deny & mask;
      if (maskedAllow !== allow || maskedDeny !== deny) ctx.maskedOverwrites++;
      allow = maskedAllow;
      deny = maskedDeny;
    }
    list.push({ id: o.id, type: o.type, allow, deny });
  }
  return list;
}

const emojiData = (emoji) => (emoji ? { id: emoji.id ?? null, name: emoji.name ?? null } : null);

// Opções de criação do novo canal a partir do original e do que a pessoa marcou para copiar
function channelOptions(source, state, parent, name, overwrites, reason) {
  const items = state.items;
  const options = { name, type: source.type, parent: parent.id, reason };

  if (items.has("chanPerms")) options.permissionOverwrites = overwrites;
  if (items.has("topic") && source.topic) options.topic = source.topic;
  if (items.has("nsfw") && source.nsfw) options.nsfw = true;
  if (items.has("slowmode") && source.rateLimitPerUser) options.rateLimitPerUser = source.rateLimitPerUser;

  if (items.has("voiceCfg") && VOICE_TYPES.has(source.type)) {
    if (source.bitrate) options.bitrate = source.bitrate;
    if (source.type === ChannelType.GuildVoice) {
      if (source.userLimit) options.userLimit = source.userLimit;
      if (source.videoQualityMode) options.videoQualityMode = source.videoQualityMode;
    }
    if (source.rtcRegion) options.rtcRegion = source.rtcRegion;
  }

  if (items.has("threadCfg") && THREAD_PARENT_TYPES.has(source.type)) {
    if (source.defaultAutoArchiveDuration) options.defaultAutoArchiveDuration = source.defaultAutoArchiveDuration;
    if (source.defaultThreadRateLimitPerUser) {
      options.defaultThreadRateLimitPerUser = source.defaultThreadRateLimitPerUser;
    }
  }

  if (items.has("forumCfg") && FORUM_TYPES.has(source.type)) {
    if (source.availableTags?.length) {
      options.availableTags = source.availableTags.map((tag) => ({
        name: tag.name,
        moderated: tag.moderated,
        emoji: emojiData(tag.emoji),
      }));
    }
    if (source.defaultReactionEmoji) options.defaultReactionEmoji = emojiData(source.defaultReactionEmoji);
    if (source.defaultSortOrder != null) options.defaultSortOrder = source.defaultSortOrder;
    if (source.type === ChannelType.GuildForum && source.defaultForumLayout != null) {
      options.defaultForumLayout = source.defaultForumLayout;
    }
  }

  return options;
}

function categoryPosition(source, state, index, guild) {
  switch (state.position) {
    case "above":
      return source.rawPosition + index;
    case "top":
      return index;
    case "end":
      return guild.channels.cache.size + index;
    default:
      return source.rawPosition + 1 + index;
  }
}

// Faz a duplicação. onProgress(feito, total, nome) é chamado a cada canal.
// Retorna { created: [{ category, channels }], failures: [{ name, reason }], notes: [] }
async function runClone({ guild, state, executor, onProgress = () => {} }) {
  const source = guild.channels.cache.get(state.sourceId);
  if (!source || source.type !== ChannelType.GuildCategory) {
    throw new Error("A categoria original não existe mais.");
  }

  const planned = plannedChannels(state, source);
  const total = (planned.length + 1) * state.copies;
  const reason = `Duplicação da categoria "${source.name}" por ${executor?.user?.username ?? "alguém"}`.slice(0, 450);
  const ctx = { members: new Map(), skippedMembers: 0, skippedRoles: 0, maskedOverwrites: 0 };
  const result = { created: [], failures: [], notes: [] };
  let done = 0;

  for (let copy = 0; copy < state.copies; copy++) {
    const name = copyName(state, copy);
    onProgress(done, total, name);

    const categoryOverwrites = state.items.has("catPerms") ? await buildOverwrites(source, guild, ctx) : [];
    const category = await guild.channels
      .create({
        name,
        type: ChannelType.GuildCategory,
        position: categoryPosition(source, state, copy, guild),
        permissionOverwrites: categoryOverwrites,
        reason,
      })
      .catch((err) => {
        throw new Error(`Não consegui criar a categoria "${name}": ${err.message}`);
      });

    const entry = { category, channels: [] };
    result.created.push(entry);
    done++;

    for (const channel of planned) {
      const channelName = newChannelName(channel, state);
      onProgress(done, total, channelName);

      try {
        const overwrites = state.items.has("chanPerms") ? await buildOverwrites(channel, guild, ctx) : [];
        const created = await guild.channels.create(channelOptions(channel, state, category, channelName, overwrites, reason));
        entry.channels.push(created);

        // Fórum/mídia: "exigir tag" e "esconder download" são flags do canal (não da criação)
        if (state.items.has("forumCfg") && FORUM_TYPES.has(channel.type)) {
          const bits = Number(channel.flags?.bitfield ?? 0) & FORUM_FLAGS;
          if (bits) {
            await created.edit({ flags: bits, reason }).catch(() => {
              result.failures.push({ name: channelName, reason: "não consegui copiar as opções extras do fórum (exigir tag)" });
            });
          }
        }
      } catch (err) {
        result.failures.push({ name: channelName, reason: err.message });
      }
      done++;
    }
  }

  if (ctx.skippedMembers) {
    result.notes.push(`${ctx.skippedMembers} permissão(ões) de membros que não estão mais no servidor foram ignoradas.`);
  }
  if (ctx.skippedRoles) result.notes.push(`${ctx.skippedRoles} permissão(ões) de cargos apagados foram ignoradas.`);
  if (ctx.maskedOverwrites) {
    result.notes.push(`${ctx.maskedOverwrites} permissão(ões) usavam itens que o bot não tem e foram simplificadas.`);
  }

  onProgress(total, total, "");
  return result;
}

// Apaga o que a última duplicação criou (canais primeiro, depois a categoria)
async function undoClone(guild, created, executor) {
  const reason = `Duplicação desfeita por ${executor?.user?.username ?? "alguém"}`.slice(0, 450);
  let deleted = 0;
  let failed = 0;

  const remove = async (channel) => {
    const live = guild.channels.cache.get(channel.id);
    if (!live) return; // já apagado
    try {
      await live.delete(reason);
      deleted++;
    } catch {
      failed++;
    }
  };

  for (const entry of created) {
    for (const channel of entry.channels) await remove(channel);
    await remove(entry.category);
  }
  return { deleted, failed };
}

module.exports = {
  TYPE_INFO,
  categoryChildren,
  plannedChannels,
  newChannelName,
  copyName,
  describeCategory,
  reviewInfo,
  runClone,
  undoClone,
};
