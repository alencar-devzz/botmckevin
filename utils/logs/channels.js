const { AuditLogEvent } = require("discord.js");
const { activeCategory, deliver } = require("./send");
const { findAudit, executorText } = require("./audit");
const { COLORS, code, channelBlock, channelTypeName, diffOverwrites } = require("./format");

const categoryName = (channel) => channel.parent?.name ?? "Nenhuma";

// Ignora quando o executor é bot e a categoria pede isso
const skipByBot = (cfg, entry) => Boolean(cfg.ignoreBots && entry?.executor?.bot);

module.exports = [
  {
    name: "channelCreate",
    async execute(channel) {
      const guild = channel.guild;
      if (!guild) return;
      const cfg = await activeCategory(guild, "canais");
      if (!cfg) return;

      const entry = await findAudit(guild, AuditLogEvent.ChannelCreate, channel.id);
      if (skipByBot(cfg, entry)) return;

      await deliver(guild, cfg, {
        title: `Canal criado — ${guild.name}`,
        color: COLORS.green,
        groups: [
          [
            channelBlock(channel),
            `**Tipo:** ${channelTypeName(channel.type)}`,
            `**Categoria:** ${categoryName(channel)}`,
            `**Executado por:** ${executorText(entry)}`,
          ],
        ],
      });
    },
  },

  {
    name: "channelDelete",
    async execute(channel) {
      const guild = channel.guild;
      if (!guild) return;
      const cfg = await activeCategory(guild, "canais");
      if (!cfg) return;

      const entry = await findAudit(guild, AuditLogEvent.ChannelDelete, channel.id);
      if (skipByBot(cfg, entry)) return;

      await deliver(guild, cfg, {
        title: `Canal excluído — ${guild.name}`,
        color: COLORS.red,
        groups: [
          [
            `**Canal:** ${code(`#${channel.name}`)} (${code(channel.id)})`,
            `**Tipo:** ${channelTypeName(channel.type)}`,
            `**Categoria:** ${categoryName(channel)}`,
            `**Executado por:** ${executorText(entry)}`,
          ],
        ],
      });
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

      const entry = await findAudit(
        guild,
        [
          AuditLogEvent.ChannelUpdate,
          AuditLogEvent.ChannelOverwriteCreate,
          AuditLogEvent.ChannelOverwriteUpdate,
          AuditLogEvent.ChannelOverwriteDelete,
        ],
        newChannel.id
      );
      if (skipByBot(cfg, entry)) return;

      const groups = [
        [
          channelBlock(newChannel),
          `**Tipo:** ${channelTypeName(newChannel.type)}`,
          `**Categoria:** ${categoryName(newChannel)}`,
          `**Executado por:** ${executorText(entry)}`,
        ],
      ];
      if (changes.length) groups.push(changes.slice(0, 8));

      let budget = 12;
      for (const group of permGroups.slice(0, 4)) {
        const lines = group.lines.slice(0, budget);
        budget -= lines.length;
        if (!lines.length) break;
        groups.push([`**Permissões de ${group.who} alteradas:**`, ...lines]);
      }

      await deliver(guild, cfg, {
        title: `Canal editado — ${guild.name}`,
        color: COLORS.white,
        groups,
      });
    },
  },
];
