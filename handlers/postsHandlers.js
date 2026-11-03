const {
  ComponentType,
  MessageFlags,
  PermissionFlagsBits,
  TextInputStyle,
} = require("discord.js");
const Post = require("../database/models/Post");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");
const {
  KEYS,
  STYLES,
  POSITIONS,
  getPostConfig,
  updatePostConfig,
  resetPostConfig,
} = require("../utils/post/store");
const { parseEmojiInput } = require("../utils/post/emojis");
const { textLabel, modal } = require("../ui/modalHelpers");
const {
  buildPostsPanel,
  buildPostButtonPanel,
  buildPostContainer,
  buildInteractionsView,
  buildPostMissing,
  paginate,
} = require("../ui/posts");

const EPHEMERAL = MessageFlags.Ephemeral;
const V2 = MessageFlags.IsComponentsV2;
const MAX_COMMENTS = 500;

// ======================= Configuração (Comunidade → Posts e Instagram) =======================

async function guard(interaction) {
  const member = interaction.member;
  const allowed =
    member?.permissions?.has(PermissionFlagsBits.Administrator) ||
    member?.roles?.cache?.hasAny(...ALL_STAFF_ROLE_IDS);
  if (allowed) return true;

  await interaction.reply({
    content: "Você não tem permissão para configurar o sistema de posts.",
    flags: EPHEMERAL,
  });
  return false;
}

async function panel(guild) {
  return buildPostsPanel(guild, await getPostConfig(guild.id));
}

async function buttonPanel(guild, key) {
  return buildPostButtonPanel(await getPostConfig(guild.id), key);
}

const BUTTON_TITLES = {
  like: "Curtir",
  comment: "Comentar",
  view: "Ver comentários/curtidas",
  delete: "Excluir",
};

async function openPostsPanel(interaction) {
  if (!(await guard(interaction))) return;
  return interaction.update({ components: await panel(interaction.guild) });
}

const NEEDED_PERMS = [
  [PermissionFlagsBits.ViewChannel, "Ver canal"],
  [PermissionFlagsBits.SendMessages, "Enviar mensagens"],
  [PermissionFlagsBits.ManageWebhooks, "Gerenciar webhooks"],
  [PermissionFlagsBits.ManageMessages, "Gerenciar mensagens"],
  [PermissionFlagsBits.AttachFiles, "Anexar arquivos"],
];

async function handlePostsConfigSelect(interaction) {
  if (!(await guard(interaction))) return;
  const { guild } = interaction;

  if (interaction.customId === "pcfg_channel") {
    const channel = guild.channels.cache.get(interaction.values[0]);
    const perms = channel?.permissionsFor(guild.members.me);
    const missing = NEEDED_PERMS.filter(([flag]) => !perms?.has(flag)).map(([, name]) => name);
    if (missing.length) {
      return interaction.reply({
        content: `Eu preciso das seguintes permissões nesse canal: **${missing.join(", ")}**. Ajuste e tente de novo.`,
        flags: EPHEMERAL,
      });
    }
    await updatePostConfig(guild.id, { channelId: channel.id, enabled: true });
    return interaction.update({ components: await panel(guild) });
  }

  const [action, key] = interaction.customId.split(":");

  // Escolheu qual botão editar
  if (action === "pcfg_pick") {
    const picked = interaction.values[0];
    if (!KEYS.includes(picked)) return;
    return interaction.update({ components: await buttonPanel(guild, picked) });
  }

  if (!KEYS.includes(key)) return;
  const value = interaction.values[0];

  // Cor (cinza = sem cor)
  if (action === "pcfg_color") {
    if (!STYLES.includes(value)) return;
    await updatePostConfig(guild.id, { [`buttons.${key}.style`]: value });
    return interaction.update({ components: await buttonPanel(guild, key) });
  }

  // Posição: topo (só um botão) ou rodapé
  if (action === "pcfg_pos") {
    if (!POSITIONS.includes(value)) return;
    const cfg = await getPostConfig(guild.id);
    const patch = { [`buttons.${key}.position`]: value };
    if (value === "top") {
      for (const other of KEYS) {
        if (other !== key && cfg.buttons[other].position === "top") {
          patch[`buttons.${other}.position`] = "bottom";
        }
      }
    }
    await updatePostConfig(guild.id, patch);
    return interaction.update({ components: await buttonPanel(guild, key) });
  }
}

async function handlePostsConfigButton(interaction) {
  if (!(await guard(interaction))) return;
  const { guild } = interaction;
  const [action, key] = interaction.customId.split(":");

  switch (action) {
    case "pcfg_toggle": {
      const cfg = await getPostConfig(guild.id);
      await updatePostConfig(guild.id, { enabled: !cfg.enabled });
      return interaction.update({ components: await panel(guild) });
    }
    case "pcfg_clear": {
      await updatePostConfig(guild.id, { channelId: null });
      return interaction.update({ components: await panel(guild) });
    }
    case "pcfg_back": {
      return interaction.update({ components: await panel(guild) });
    }

    // Linha de botões acima/abaixo da mídia
    case "pcfg_rowpos": {
      const cfg = await getPostConfig(guild.id);
      await updatePostConfig(guild.id, { rowPosition: cfg.rowPosition === "above" ? "below" : "above" });
      return interaction.update({ components: await panel(guild) });
    }

    // Volta tudo (emojis, cores, posições e ordem) ao padrão
    case "pcfg_reset_all": {
      await resetPostConfig(guild.id, ["buttons", "order", "rowPosition"]);
      return interaction.update({ components: await panel(guild) });
    }

    case "pcfg_emoji": {
      if (!KEYS.includes(key)) return;
      const cfg = await getPostConfig(guild.id);
      return interaction.showModal(
        modal(
          `pcfg_modal:emoji:${key}`,
          `Emoji: ${BUTTON_TITLES[key]}`,
          textLabel({
            id: "emoji",
            label: "Emoji do botão",
            description: "Emoji normal ou personalizado (copie com \\:nome: no chat). Vazio = padrão.",
            max: 60,
            required: false,
            value: cfg.buttons[key].emoji ?? undefined,
            placeholder: "Ex.: ❤️ ou <:nome:123456789012345678>",
          })
        )
      );
    }

    // Move o botão uma casa na linha do rodapé
    case "pcfg_left":
    case "pcfg_right": {
      if (!KEYS.includes(key)) return;
      const cfg = await getPostConfig(guild.id);
      const order = [...cfg.order];
      const bottom = order.filter((k) => cfg.buttons[k].position === "bottom");
      const at = bottom.indexOf(key);
      const target = bottom[at + (action === "pcfg_left" ? -1 : 1)];
      if (at !== -1 && target) {
        const a = order.indexOf(key);
        const b = order.indexOf(target);
        [order[a], order[b]] = [order[b], order[a]];
        await updatePostConfig(guild.id, { order });
      }
      return interaction.update({ components: await buttonPanel(guild, key) });
    }

    // Restaura emoji, cor e posição de um botão
    case "pcfg_resetbtn": {
      if (!KEYS.includes(key)) return;
      await resetPostConfig(guild.id, [`buttons.${key}`]);
      return interaction.update({ components: await buttonPanel(guild, key) });
    }

    default:
      return;
  }
}

// Modal de emoji do botão
async function handlePostsConfigModal(interaction) {
  if (!(await guard(interaction))) return;
  const { guild } = interaction;
  const [, field, key] = interaction.customId.split(":");
  if (field !== "emoji" || !KEYS.includes(key)) return;

  const raw = interaction.fields.getTextInputValue("emoji").trim();
  let value = null; // vazio = emoji padrão
  if (raw) {
    const parsed = parseEmojiInput(raw, interaction.client);
    if (!parsed.ok) {
      return interaction.reply({ content: parsed.error, flags: EPHEMERAL });
    }
    value = parsed.value;
  }

  await updatePostConfig(guild.id, { [`buttons.${key}.emoji`]: value });
  const components = await buttonPanel(guild, key);
  if (interaction.isFromMessage()) return interaction.update({ components });
  return interaction.reply({ components, flags: V2 | EPHEMERAL });
}

// ======================= Interações com o post =======================

// Pega as urls atuais da mídia direto da mensagem (urls do CDN sempre atualizadas)
function extractMediaUrls(message) {
  const urls = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    if (node.type === ComponentType.MediaGallery && Array.isArray(node.items)) {
      for (const item of node.items) {
        if (item?.media?.url) urls.push(item.media.url);
      }
    }
    if (Array.isArray(node.components)) walk(node.components);
  };
  walk(JSON.parse(JSON.stringify(message.components ?? [])));
  return urls;
}

async function postComponents(message, post) {
  const cfg = await getPostConfig(message.guildId);
  const urls = extractMediaUrls(message);
  const media = urls.length ? urls : post.mediaFiles.map((name) => `attachment://${name}`);
  return [buildPostContainer(post, media, cfg)];
}

async function resolveAvatars(guild, ids) {
  const avatars = new Map();
  await Promise.all(
    [...new Set(ids)].map(async (id) => {
      const member = guild.members.cache.get(id) ?? (await guild.members.fetch(id).catch(() => null));
      const who = member ?? (await guild.client.users.fetch(id).catch(() => null));
      if (who) avatars.set(id, who.displayAvatarURL({ extension: "png", size: 128 }));
    })
  );
  return avatars;
}

// Monta a visão de comentários ("c") ou curtidas ("l") de um post
async function viewComponents(guild, messageId, view, page) {
  const post = await Post.findOne({ messageId }).lean();
  if (!post) return buildPostMissing();

  const list = view === "l" ? post.likes : post.comments;
  const pg = paginate(list, page);
  const avatars = await resolveAvatars(
    guild,
    pg.items.map((item) => (view === "l" ? item : item.userId))
  );
  return buildInteractionsView({ messageId, post, view, ...pg, avatars });
}

const notFound = (interaction) =>
  interaction.reply({ content: "Não encontrei os dados deste post.", flags: EPHEMERAL });

async function handlePostButton(interaction) {
  const [action, messageId, view, page] = interaction.customId.split(":");

  switch (action) {
    case "post_like": {
      const id = interaction.message.id;
      const current = await Post.findOne({ messageId: id }).lean();
      if (!current) return notFound(interaction);

      const userId = interaction.user.id;
      const update = current.likes.includes(userId)
        ? { $pull: { likes: userId } }
        : { $addToSet: { likes: userId } };
      const post = await Post.findOneAndUpdate({ messageId: id }, update, { new: true }).lean();
      return interaction.update({ components: await postComponents(interaction.message, post) });
    }

    case "post_comment": {
      return interaction.showModal(
        modal(
          `post_modal:${interaction.message.id}`,
          "Comentar no post",
          textLabel({
            id: "comment",
            label: "Seu comentário",
            style: TextInputStyle.Paragraph,
            max: 300,
            required: true,
            placeholder: "Escreva o que você achou deste post...",
          })
        )
      );
    }

    case "post_view": {
      return interaction.reply({
        components: await viewComponents(interaction.guild, interaction.message.id, "c", 1),
        flags: V2 | EPHEMERAL,
      });
    }

    case "post_switch": {
      return interaction.update({
        components: await viewComponents(interaction.guild, messageId, view, 1),
      });
    }

    case "post_nav": {
      return interaction.update({
        components: await viewComponents(interaction.guild, messageId, view, Number(page)),
      });
    }

    case "post_delete": {
      const post = await Post.findOne({ messageId: interaction.message.id }).lean();
      if (!post) return notFound(interaction);

      if (post.authorId !== interaction.user.id) {
        return interaction.reply({
          content: "Apenas o autor do post pode excluí-lo.",
          flags: EPHEMERAL,
        });
      }

      await interaction.deferUpdate();
      await Post.deleteOne({ messageId: post.messageId });
      await interaction.deleteReply().catch(() => interaction.message.delete().catch(() => {}));
      return;
    }

    default:
      return;
  }
}

// Modal de comentário
async function handlePostModal(interaction) {
  const messageId = interaction.customId.split(":")[1];
  const text = interaction.fields.getTextInputValue("comment").trim();

  if (!text) {
    return interaction.reply({ content: "O comentário não pode ficar vazio.", flags: EPHEMERAL });
  }

  const post = await Post.findOneAndUpdate(
    { messageId },
    {
      $push: {
        comments: {
          $each: [{ userId: interaction.user.id, text, createdAt: new Date() }],
          $slice: -MAX_COMMENTS,
        },
      },
    },
    { new: true }
  ).lean();

  if (!post) return notFound(interaction);

  // Atualiza o contador de comentários no post
  if (interaction.isFromMessage()) {
    await interaction.update({ components: await postComponents(interaction.message, post) });
    return interaction.followUp({ content: "Seu comentário foi enviado!", flags: EPHEMERAL });
  }
  return interaction.reply({ content: "Seu comentário foi enviado!", flags: EPHEMERAL });
}

module.exports = {
  openPostsPanel,
  handlePostsConfigSelect,
  handlePostsConfigButton,
  handlePostsConfigModal,
  handlePostButton,
  handlePostModal,
};
