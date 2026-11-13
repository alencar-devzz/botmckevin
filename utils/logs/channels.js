const { AuditLogEvent } = require("discord.js");
const { activeCategory, deliver } = require("./send");
const { findAudit, executorText } = require("./audit");
const { add, listLimited } = require("./batch");
const { COLORS, code, channelBlock, channelTypeName, diffOverwrites } = require("./format");
const { consumeChannelCreate, consumeChannelDelete } = require("./suppress");

const categoryName = (channel) => channel.parent?.name ?? "Nenhuma";

// Ignora quando o executor é bot e a categoria pede isso
const skipByBot = (cfg, entry) => Boolean(cfg.ignoreBots && entry?.executor?.bot);

// Procura o executor: pelo canal quando é um só; pela ação mais recente quando são vários
const lookup = (guild, types, items) =>
  findAudit(guild, types, items.length === 1 ? items[0].id : null, { maxAge: 40000 });

const typeSummary = (items) => {
  const counts = {};
  for (const i of items) counts[i.typeName] = (counts[i.typeName] ?? 0) + 1;
  return Object.entries(counts)
    .map(([name, n]) => `${code(name)} ×${n}`)
    .join(" · ");
};

// ---------- criados / excluídos (um log só por rajada) ----------
async function flushCreateDelete(guild, cfg, items, { created }) {
  const entry = await lookup(guild, created ? AuditLogEvent.ChannelCreate : AuditLogEvent.ChannelDelete, items);
  if (skipByBot(cfg, entry)) return;

  if (items.length === 1) {
    const i = items[0];
    return deliver(guild, cfg, {
      title: `${created ? "Canal criado" : "Canal excluído"} — ${guild.name}`,
      color: created ? COLORS.green : COLORS.red,
      groups: [
        [
          created ? channelBlock(i.channel) : `**Canal:** ${code(`#${i.name}`)} (${code(i.id)})`,
          `**Tipo:** ${i.typeName}`,
          `**Categoria:** ${i.parent}`,
          `**Executado por:** ${executorText(entry)}`,
        ],
      ],
    });
  }

  const lines = items.map((i) =>
    created ? `<#${i.id}> — ${code(i.name)} (${i.typeName})` : `${code(`#${i.name}`)} (${i.typeName})`
  );
  return deliver(guild, cfg, {
    title: `${created ? "Canais criados" : "Canais excluídos"} em massa — ${guild.name}`,
    color: created ? COLORS.green : COLORS.red,
    groups: [
      [
        `**Executado por:** ${executorText(entry)}`,
        `**Total:** ${code(items.length)}`,
        `**Tipos:** ${typeSummary(items)}`,
      ],
      listLimited(lines, 20),
    ],
  });
}

// ---------- editados (categoria sincronizada gera um evento por canal filho) ----------
const UPDATE_TYPES = [
  AuditLogEvent.ChannelUpdate,
  AuditLogEvent.ChannelOverwriteCreate,
  AuditLogEvent.ChannelOverwriteUpdate,
  AuditLogEvent.ChannelOverwriteDelete,
];

function renderChanges(item) {
  const groups = [];
  if (item.changes.length) groups.push(item.changes.slice(0, 8));
  let budget = 12;
  for (const group of item.permGroups.slice(0, 4)) {
    const lines = group.lines.slice(0, budget);
    budget -= lines.length;
    if (!lines.length) break;
    groups.push([`**Permissões de ${group.who} alteradas:**`, ...lines]);
  }
  return groups;
}

async function flushUpdate(guild, cfg, items) {
  const entry = await lookup(guild, UPDATE_TYPES, items);
  if (skipByBot(cfg, entry)) return;

  if (items.length === 1) {
    const i = items[0];
    return deliver(guild, cfg, {
      title: `Canal editado — ${guild.name}`,
      color: COLORS.white,
      groups: [
        [
          channelBlock(i.channel),
          `**Tipo:** ${i.typeName}`,
          `**Categoria:** ${i.parent}`,
          `**Executado por:** ${executorText(entry)}`,
        ],
        ...renderChanges(i),
      ],
    });
  }

  // Junta canais que sofreram exatamente a mesma alteração (ex: categoria sincronizada)
  const bySignature = new Map();
  for (const i of items) {
    const sig = JSON.stringify([i.changes, i.permGroups]);
    if (!bySignature.has(sig)) bySignature.set(sig, []);
    bySignature.get(sig).push(i);
  }

  const groups = [
    [
      `**Executado por:** ${executorText(entry)}`,
      `**Canais editados:** ${code(new Set(items.map((i) => i.id)).size)}`,
    ],
  ];

  let shown = 0;
  for (const list of bySignature.values()) {
    if (shown >= 3) break;
    shown++;
    const ids = [...new Set(list.map((i) => i.id))];
    groups.push([
      `**Alteração em ${ids.length} canal(is):**`,
      ids.slice(0, 15).map((id) => `<#${id}>`).join(" ") + (ids.length > 15 ? ` … +${ids.length - 15}` : ""),
    ]);
    groups.push(...renderChanges(list[0]).slice(0, 2));
  }
  if (bySignature.size > shown) groups.push([`… e mais ${bySignature.size - shown} tipo(s) de alteração`]);

  return deliver(guild, cfg, {
    title: `Canais editados em massa — ${guild.name}`,
    color: COLORS.white,
    groups,
  });
}

module.exports = [
  {
    name: "channelCreate",
    async execute(channel) {
      const guild = channel.guild;
      if (!guild) return;
      if (consumeChannelCreate(channel)) return; // recriado pelo nnuke: o comando envia o próprio log
      const cfg = await activeCategory(guild, "canais");
      if (!cfg) return;

      add(
        `chcreate:${guild.id}`,
        {
          id: channel.id,
          name: channel.name,
          channel,
          typeName: channelTypeName(channel.type),
          parent: categoryName(channel),
        },
        (items) => flushCreateDelete(guild, cfg, items, { created: true })
      );
    },
  },

  {
    name: "channelDelete",
    async execute(channel) {
      const guild = channel.guild;
      if (!guild) return;
      if (consumeChannelDelete(channel.id)) return; // recriado pelo nnuke: o comando envia o próprio log
      const cfg = await activeCategory(guild, "canais");
      if (!cfg) return;

      add(
        `chdelete:${guild.id}`,
        {
          id: channel.id,
          name: channel.name,
          typeName: channelTypeName(channel.type),
          parent: categoryName(channel),
        },
        (items) => flushCreateDelete(guild, cfg, items, { created: false })
      );
    },
  },

  {
    name: "channelUpdate",
    async execute(oldChannel, newChannel) {
      const guild = newChannel.guild;
      if (!guild) return;

      // ----- o que mudou -----
      const changes = [];
      const push = (label, a, b) => {
        if (a !== b) changes.push(`**${label}:** ${code(a ?? "Nenhum")} → ${code(b ?? "Nenhum")}`);
      };
      push("Nome", oldChannel.name, newChannel.name);
      push("Tópico", oldChannel.topic, newChannel.topic);
      push("Categoria", oldChannel.parent?.name, newChannel.parent?.name);
      if (oldChannel.nsfw !== newChannel.nsfw) {
        push("NSFW", oldChannel.nsfw ? "Sim" : "Não", newChannel.nsfw ? "Sim" : "Não");
      }
      push("Modo lento", oldChannel.rateLimitPerUser, newChannel.rateLimitPerUser);
      push("Taxa de bits", oldChannel.bitrate, newChannel.bitrate);
      push("Limite de usuários", oldChannel.userLimit, newChannel.userLimit);

      const permGroups = diffOverwrites(oldChannel, newChannel);
      if (!changes.length && !permGroups.length) return; // só mudou a posição

      const cfg = await activeCategory(guild, "canais");
      if (!cfg) return;

      add(
        `chupdate:${guild.id}`,
        {
          id: newChannel.id,
          channel: newChannel,
          typeName: channelTypeName(newChannel.type),
          parent: categoryName(newChannel),
          changes,
          permGroups,
        },
        (items) => flushUpdate(guild, cfg, items)
      );
    },
  },
];
