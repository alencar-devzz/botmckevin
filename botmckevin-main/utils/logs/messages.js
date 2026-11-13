const { AuditLogEvent } = require("discord.js");
const { activeCategory, deliver } = require("./send");
const { findAudit } = require("./audit");
const { isSuppressed } = require("./suppress");
const { COLORS, userBlock, channelBlock, codeBlock, code } = require("./format");
const {
  getStored,
  getManyStored,
  swapContent,
  removeStored,
  authorFromStored,
} = require("./messageStore");

module.exports = [
  // Mensagem apagada
  {
    name: "messageDelete",
    async execute(message) {
      const guild = message.guild;
      if (!guild) return;

      // Depois de um reinício o Discord não entrega autor nem texto: busca o que foi salvo no Mongo
      const stored = await getStored(message.id);
      try {
        if (isSuppressed(message.id)) return; // apagada pelo comando limpar: vai num log único
        const author = message.author ?? authorFromStored(stored);
        const cfg = await activeCategory(guild, "mensagens", author?.bot);
        if (!cfg) return;

        const entry = author
          ? await findAudit(guild, AuditLogEvent.MessageDelete, author.id, {
              match: (e) => e.extra?.channel?.id === message.channelId,
              tries: 1,
              delay: 800,
            })
          : null;

        let executor;
        if (entry?.executor) {
          const tag =
            entry.executor.id === message.client.user.id
              ? "ação automática do bot"
              : entry.executor.id === author?.id
                ? "o próprio autor"
                : "moderador";
          executor = `**Executor:** <@${entry.executor.id}> — ${code(entry.executor.username)} (${tag})`;
        } else if (author) {
          executor = `**Executor:** <@${author.id}> — ${code(author.username)} (o próprio autor)`;
        } else {
          executor = "**Executor:** `Desconhecido`";
        }

        const text = message.content || stored?.content;
        const content = text
          ? text
          : message.partial && !stored
            ? "(indisponível: a mensagem não foi salva)"
            : "(sem texto)";

        const attachments = message.attachments?.size || stored?.attachments?.length || 0;
        const info = [
          message.channel ? channelBlock(message.channel) : `**Canal:** <#${message.channelId}>`,
          executor,
          `**Mensagem ID:** ${code(message.id)}`,
        ];
        if (attachments) info.push(`**Anexos:** ${code(attachments)}`);

        await deliver(guild, cfg, {
          title: `Mensagem apagada — ${guild.name}`,
          color: COLORS.red,
          thumbnail: author?.displayAvatarURL(),
          groups: [
            [author ? userBlock(author, "Autor") : "**Autor:** `Desconhecido`"],
            info,
            ["**Conteúdo**", codeBlock(content)],
          ],
        });
      } finally {
        removeStored(message.id); // a mensagem não existe mais: libera o espaço no Mongo
      }
    },
  },

  // Apagamento em massa (bulkDelete, ferramentas de moderação etc.): um log só
  {
    name: "messageDeleteBulk",
    async execute(messages, channel) {
      const guild = channel?.guild;
      if (!guild) return;
      const stored = await getManyStored([...messages.keys()]);
      removeStored([...messages.keys()]);
      const list = [...messages.values()].filter((m) => !isSuppressed(m.id));
      if (!list.length) return;

      const cfg = await activeCategory(guild, "mensagens");
      if (!cfg) return;

      const entry = await findAudit(guild, AuditLogEvent.MessageBulkDelete, null, {
        match: (e) => e.target?.id === channel.id || e.extra?.channel?.id === channel.id,
        tries: 1,
        delay: 800,
      });
      const authors = new Set(
        list.map((m) => m.author?.id ?? stored.get(m.id)?.authorId).filter(Boolean)
      );

      await deliver(guild, cfg, {
        title: `Mensagens apagadas em massa — ${guild.name}`,
        color: COLORS.red,
        groups: [
          [
            channelBlock(channel),
            `**Executado por:** ${entry?.executor ? `<@${entry.executor.id}>` : "`Desconhecido`"}`,
            `**Total de mensagens apagadas:** ${code(messages.size)}`,
            `**Autores identificados:** ${code(authors.size)}`,
          ],
        ],
      });
    },
  },

  // Mensagem editada
  {
    name: "messageUpdate",
    async execute(oldMessage, newMessage) {
      if (newMessage.partial) await newMessage.fetch().catch(() => {});
      const guild = newMessage.guild;
      if (!guild || !newMessage.author) return;

      // Atualiza o Mongo com o texto novo e pega como estava antes (serve quando o bot reiniciou e o cache sumiu)
      const previous = await swapContent(newMessage);
      const before = oldMessage.content ?? previous?.content ?? null;
      if (before === newMessage.content) return; // só embed/fixação mudou

      const cfg = await activeCategory(guild, "mensagens", newMessage.author.bot);
      if (!cfg) return;

      await deliver(guild, cfg, {
        title: `Mensagem editada — ${guild.name}`,
        color: COLORS.white,
        thumbnail: newMessage.author.displayAvatarURL(),
        openUrl: newMessage.url,
        groups: [
          [userBlock(newMessage.author, "Autor")],
          [channelBlock(newMessage.channel), `**Mensagem ID:** ${code(newMessage.id)}`],
          ["**Antes**", codeBlock(before ?? "(indisponível: a mensagem não foi salva)")],
          ["**Depois**", codeBlock(newMessage.content)],
        ],
      });
    },
  },
];
