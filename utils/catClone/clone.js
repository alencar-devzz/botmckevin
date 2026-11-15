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
  [ChannelType.GuildText]: { key: "text", label: "Texto" },
  [ChannelType.GuildAnnouncement]: { key: "announcement", label: "Anúncios" },
  [ChannelType.GuildVoice]: { key: "voice", label: "Voz" },
  [ChannelType.GuildStageVoice]: { key: "stage", label: "Palco" },
  [ChannelType.GuildForum]: { key: "forum", label: "Fórum" },
  [ChannelType.GuildMedia]: { key: "media", label: "Mídia" },
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

// Filtro por nome (o que a pessoa digitou em "Filtrar por nome"): só entra quem contém o texto de "incluir"
// e nunca quem contém o texto de "excluir"
function passesFilter(state, channel) {
  const name = channel.name.toLowerCase();
  if (state.filterInclude && !name.includes(state.filterInclude.toLowerCase())) return false;
  if (state.filterExclude && name.includes(state.filterExclude.toLowerCase())) return false;
  return true;
}

// Canais que serão copiados: tipo ligado, dentro do filtro e não excluído na lista
function plannedChannels(state, category) {
  const list = categoryChildren(category).filter(
    (channel) =>
      state.types.has(TYPE_INFO[channel.type].key) && !state.excluded.has(channel.id) && passesFilter(state, channel)
  );
  if (state.order === "az") {
    // Ordem alfabética dentro de cada grupo (texto primeiro, depois voz)
    list.sort(
      (a, b) =>
        Number(VOICE_TYPES.has(a.type)) - Number(VOICE_TYPES.has(b.type)) || a.name.localeCompare(b.name, "pt-BR")
    );
  }
  return list;
}

// Nome do canal na cópia: troca de texto, depois prefixo e sufixo
function newChannelName(channel, state) {
  let name = channel.name;
  if (state.find) name = name.replace(new RegExp(escapeRegex(state.find), "gi"), state.replace ?? "");
  name = `${state.prefix ?? ""}${name}${state.suffix ?? ""}`.slice(0, 100);
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

// Permissões (cargos e membros) de um canal. Membros que saíram do servidor e cargos apagados ficam de fora
// (contados em ctx).
async function readOverwrites(source, guild, ctx) {
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
    list.push({ id: o.id, type: o.type, allow: o.allow.bitfield, deny: o.deny.bitfield });
  }
  return list;
}

// Opções da aba "Acesso": esconde de @everyone e/ou dá acesso (ver e, em voz, entrar) a cargos escolhidos
function applyAccess(list, state, guild, voice) {
  const out = list.map((o) => ({ ...o }));
  const upsert = (roleId, change) => {
    let entry = out.find((o) => o.id === roleId && o.type === OverwriteType.Role);
    if (!entry) {
      entry = { id: roleId, type: OverwriteType.Role, allow: 0n, deny: 0n };
      out.push(entry);
    }
    change(entry);
  };

  if (state.privateCopy) {
    upsert(guild.id, (o) => {
      o.deny |= PermissionFlagsBits.ViewChannel;
      o.allow &= ~PermissionFlagsBits.ViewChannel;
    });
  }
  const bits = PermissionFlagsBits.ViewChannel | (voice ? PermissionFlagsBits.Connect : 0n);
  for (const roleId of state.accessRoles ?? []) {
    if (!guild.roles.cache.has(roleId)) continue;
    upsert(roleId, (o) => {
      o.allow |= bits;
      o.deny &= ~bits;
    });
  }
  return out;
}

// Se o bot não é administrador, o Discord só deixa copiar bits que ele mesmo tem
function maskOverwrites(list, guild, ctx) {
  const bot = guild.members.me;
  if (!bot || bot.permissions.has(PermissionFlagsBits.Administrator)) return list;
  const mask = bot.permissions.bitfield;
  return list.map((o) => {
    const allow = o.allow & mask;
    const deny = o.deny & mask;
    if (allow !== o.allow || deny !== o.deny) ctx.maskedOverwrites++;
    return { ...o, allow, deny };
  });
}

// Permissões finais da categoria (copiadas, se marcado) e de cada canal
async function categoryOverwrites(source, guild, state, ctx) {
  const base = state.items.has("catPerms") ? await readOverwrites(source, guild, ctx) : [];
  return maskOverwrites(applyAccess(base, state, guild, false), guild, ctx);
}

async function channelOverwrites(channel, guild, state, ctx) {
  const base = await readOverwrites(channel, guild, ctx);
  return maskOverwrites(applyAccess(base, state, guild, VOICE_TYPES.has(channel.type)), guild, ctx);
}

const emojiData = (emoji) => (emoji ? { id: emoji.id ?? null, name: emoji.name ?? null } : null);

// Opções de criação do novo canal a partir do original e do que a pessoa marcou para copiar.
// Sem "permissões de cada canal" (e sem acesso extra), o canal nasce herdando as permissões da nova categoria.
function channelOptions(source, state, parent, name, overwrites, reason) {
  const items = state.items;
  const options = { name, type: source.type, parent: parent.id, reason };

  if (overwrites) options.permissionOverwrites = overwrites;
  if (items.has("topic") && source.topic) options.topic = source.topic;
  if (items.has("nsfw") && source.nsfw) options.nsfw = true;
  if (items.has("slowmode") && source.rateLimitPerUser) options.rateLimitPerUser = source.rateLimitPerUser;

  if (VOICE_TYPES.has(source.type)) {
    if (items.has("voiceQuality")) {
      if (source.bitrate) options.bitrate = source.bitrate;
      if (source.type === ChannelType.GuildVoice && source.videoQualityMode) {
        options.videoQualityMode = source.videoQualityMode;
      }
    }
    if (items.has("voiceLimit") && source.type === ChannelType.GuildVoice && source.userLimit) {
      options.userLimit = source.userLimit;
    }
    if (items.has("voiceRegion") && source.rtcRegion) options.rtcRegion = source.rtcRegion;
  }

  if (THREAD_PARENT_TYPES.has(source.type)) {
    if (items.has("threadArchive") && source.defaultAutoArchiveDuration) {
      options.defaultAutoArchiveDuration = source.defaultAutoArchiveDuration;
    }
    if (items.has("threadSlowmode") && source.defaultThreadRateLimitPerUser) {
      options.defaultThreadRateLimitPerUser = source.defaultThreadRateLimitPerUser;
    }
  }

  if (FORUM_TYPES.has(source.type)) {
    if (items.has("forumTags") && source.availableTags?.length) {
      options.availableTags = source.availableTags.map((tag) => ({
        name: tag.name,
        moderated: tag.moderated,
        emoji: emojiData(tag.emoji),
      }));
    }
    if (items.has("forumDefaults")) {
      if (source.defaultReactionEmoji) options.defaultReactionEmoji = emojiData(source.defaultReactionEmoji);
      if (source.defaultSortOrder != null) options.defaultSortOrder = source.defaultSortOrder;
      if (source.type === ChannelType.GuildForum && source.defaultForumLayout != null) {
        options.defaultForumLayout = source.defaultForumLayout;
      }
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

    const catOverwrites = await categoryOverwrites(source, guild, state, ctx);
    const category = await guild.channels
      .create({
        name,
        type: ChannelType.GuildCategory,
        position: categoryPosition(source, state, copy, guild),
        permissionOverwrites: catOverwrites,
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
        // Com "permissões de cada canal" desligado, o canal herda as da nova categoria (que já levam o acesso extra)
        const overwrites = state.items.has("chanPerms") ? await channelOverwrites(channel, guild, state, ctx) : null;
        const created = await guild.channels.create(channelOptions(channel, state, category, channelName, overwrites, reason));
        entry.channels.push(created);

        // Fórum/mídia: "exigir tag" e "esconder download" são flags do canal (não da criação)
        if (state.items.has("forumFlags") && FORUM_TYPES.has(channel.type)) {
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
  passesFilter,
  copyName,
  describeCategory,
  reviewInfo,
  runClone,
  undoClone,
};
