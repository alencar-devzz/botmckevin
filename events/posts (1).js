const path = require("node:path");
const { AttachmentBuilder, MessageFlags, PermissionFlagsBits } = require("discord.js");
const Post = require("../database/models/Post");
const { getPostConfig } = require("../utils/posts/store");
const { buildPostContainer } = require("../ui/posts");

const WEBHOOK_NAME = "Posts";
const MAX_MEDIA = 10; // limite de itens de uma galeria
const MEDIA_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|mp4|mov|webm|mkv|m4v)$/i;

const webhookCache = new Map(); // channelId -> Webhook

function isMedia(attachment) {
  const type = attachment.contentType ?? "";
  if (type.startsWith("image/") || type.startsWith("video/")) return true;
  return MEDIA_EXT.test(attachment.name ?? "");
}

// Webhooks não aceitam "clyde" nem "discord" no nome
function safeName(name) {
  const clean = String(name ?? "")
    .replace(/clyde|discord/gi, (m) => `${m[0]}\u200b${m.slice(1)}`)
    .trim()
    .slice(0, 80);
  return clean || "Usuário";
}

// Reaproveita o webhook criado pelo próprio bot (só webhooks do bot aceitam botões)
async function getPostWebhook(channel, force = false) {
  if (!force && webhookCache.has(channel.id)) return webhookCache.get(channel.id);

  const botId = channel.client.user.id;
  const hooks = await channel.fetchWebhooks();
  let hook = hooks.find(
    (h) => (h.owner?.id === botId || h.applicationId === botId) && h.name === WEBHOOK_NAME
  );
  if (!hook) {
    hook = await channel.createWebhook({
      name: WEBHOOK_NAME,
      reason: "Sistema de Posts e Instagram",
    });
  }
  webhookCache.set(channel.id, hook);
  return hook;
}

async function sendPost(channel, payload) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const webhook = await getPostWebhook(channel, attempt > 0);
    try {
      return await webhook.send(payload);
    } catch (err) {
      if (err.code === 10015 && attempt === 0) {
        // Webhook apagado: busca/cria outro e tenta de novo
        webhookCache.delete(channel.id);
        continue;
      }
      if (err.code === 50035 && payload.username !== "Usuário") {
        payload = { ...payload, username: "Usuário" };
        continue;
      }
      throw err;
    }
  }
}

async function handlePostMessage(message) {
  if (!message.guild || message.author.bot || message.webhookId || message.system) return;

  const cfg = await getPostConfig(message.guild.id);
  if (!cfg.enabled || !cfg.channelId || cfg.channelId !== message.channelId) return;

  const media = [...message.attachments.values()].filter(isMedia).slice(0, MAX_MEDIA);
  if (!media.length) return; // mensagem sem foto/vídeo: segue normal

  const { guild, channel } = message;
  const perms = channel.permissionsFor(guild.members.me);
  const needed = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ManageWebhooks,
    PermissionFlagsBits.ManageMessages,
    PermissionFlagsBits.AttachFiles,
  ];
  if (!perms?.has(needed)) {
    console.warn(
      `[POSTS] Sem permissões em #${channel.name} (preciso de Gerenciar Webhooks, Gerenciar Mensagens e Anexar Arquivos).`
    );
    return;
  }

  try {
    // Baixa a mídia: a mensagem original será apagada, então o arquivo é reenviado junto do post
    const files = [];
    const names = [];
    for (const [index, attachment] of media.entries()) {
      const response = await fetch(attachment.url);
      if (!response.ok) throw new Error(`Falha ao baixar o anexo (HTTP ${response.status})`);
      const buffer = Buffer.from(await response.arrayBuffer());
      const extension = path.extname(attachment.name ?? "") || "";
      const name = `post_${message.id}_${index}${extension}`;
      files.push(new AttachmentBuilder(buffer, { name }));
      names.push(name);
    }

    const member =
      message.member ?? (await guild.members.fetch(message.author.id).catch(() => null));
    const displayName = member?.displayName ?? message.author.username;
    const avatarURL = (member ?? message.author).displayAvatarURL({ extension: "png", size: 256 });

    const draft = {
      authorId: message.author.id,
      content: message.content ?? "",
      likes: [],
      comments: [],
    };
    const container = buildPostContainer(
      draft,
      names.map((name) => `attachment://${name}`)
    );

    const sent = await sendPost(channel, {
      username: safeName(displayName),
      avatarURL,
      components: [container],
      files,
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
      withComponents: true,
    });

    await Post.create({
      guildId: guild.id,
      channelId: channel.id,
      messageId: sent.id,
      authorId: message.author.id,
      content: draft.content,
      mediaFiles: names,
    });

    await message.delete().catch(() => {});
  } catch (err) {
    // Em caso de erro a mensagem original NÃO é apagada
    console.error("[POSTS] Erro ao criar o post:", err);
  }
}

module.exports = [
  {
    name: "messageCreate",
    async execute(message) {
      try {
        await handlePostMessage(message);
      } catch (err) {
        console.error("[POSTS] Erro:", err);
      }
    },
  },
  {
    // Se o post for apagado (pelo autor ou por um moderador), remove os dados dele
    name: "messageDelete",
    async execute(message) {
      if (!message.guildId) return;
      await Post.deleteOne({ messageId: message.id }).catch(() => {});
    },
  },
];
