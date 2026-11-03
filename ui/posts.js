const {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  ThumbnailBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ActionRowBuilder,
} = require("discord.js");
const { addBackButton } = require("./backButton");
const { EMOJIS, emojiMarkup } = require("../utils/post/emojis");

const PER_PAGE = 3; // comentários/curtidas por página
const DEFAULT_AVATAR = "https://cdn.discordapp.com/embed/avatars/0.png";

const text = (content) => new TextDisplayBuilder().setContent(content);
const clip = (value, max) => String(value ?? "").slice(0, max);

// ---------- Painel de configuração (Comunidade e interação → Posts e Instagram) ----------

function stateOf(cfg) {
  if (!cfg.channelId) return "Sem canal";
  return cfg.enabled ? "Ativo" : "Desativado";
}

function buildPostsPanel(guild, cfg) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Posts e Instagram"),
    text("-# Fotos e vídeos enviados no canal escolhido viram posts com curtidas e comentários.")
  );

  const select = new ChannelSelectMenuBuilder()
    .setCustomId("pcfg_channel")
    .setPlaceholder("Selecione o canal de posts")
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1);
  if (cfg.channelId && guild.channels.cache.has(cfg.channelId)) {
    select.setDefaultChannels(cfg.channelId);
  }

  const config = new ContainerBuilder()
    .addTextDisplayComponents(
      text("**Canal de posts**"),
      text("-# Escolha o canal onde as pessoas vão postar fotos e vídeos."),
      text(
        `-# Atual: ${cfg.channelId ? `<#${cfg.channelId}>` : "`Não definido`"} · Estado: \`${stateOf(cfg)}\``
      )
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(select))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("pcfg_toggle")
          .setLabel(cfg.enabled ? "Desativar" : "Ativar")
          .setStyle(cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success)
          .setDisabled(!cfg.channelId),
        new ButtonBuilder()
          .setCustomId("pcfg_clear")
          .setLabel("Remover canal")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(!cfg.channelId)
      )
    );

  const info = new ContainerBuilder().addTextDisplayComponents(
    text("### Como funciona"),
    text(
      [
        "• Quando alguém envia uma foto ou vídeo no canal, o bot apaga a mensagem e posta de novo via webhook, com o nome e a foto da pessoa.",
        "• O texto enviado junto da mídia aparece abaixo da menção.",
        "• Os botões permitem curtir, comentar, ver comentários/curtidas e excluir (só o autor).",
      ].join("\n")
    ),
    text("-# O bot precisa das permissões Gerenciar Webhooks, Gerenciar Mensagens e Anexar Arquivos no canal.")
  );
  addBackButton(info, "back_comunidade");

  return [header, config, info];
}

// ---------- O post (container sem cor) ----------

// post: { authorId, content, likes: [], comments: [] }
// mediaUrls: urls (ou attachment://nome) das fotos/vídeos
function buildPostContainer(post, mediaUrls) {
  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    text(`${emojiMarkup(EMOJIS.instagram)}<@${post.authorId}>`)
  );

  if (post.content && post.content.trim()) {
    container.addTextDisplayComponents(text(clip(post.content, 3500)));
  }

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      mediaUrls.map((url) => new MediaGalleryItemBuilder().setURL(url))
    )
  );
  container.addSeparatorComponents(new SeparatorBuilder());

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("post_like")
        .setEmoji(EMOJIS.like)
        .setLabel(String(post.likes.length))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("post_comment")
        .setEmoji(EMOJIS.comment)
        .setLabel(String(post.comments.length))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("post_view")
        .setEmoji(EMOJIS.view)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("post_delete")
        .setEmoji(EMOJIS.delete)
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return container;
}

// ---------- Comentários / Curtidas (resposta efêmera) ----------

function paginate(list, page) {
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const current = Math.min(Math.max(1, Number(page) || 1), pages);
  return {
    items: list.slice((current - 1) * PER_PAGE, current * PER_PAGE),
    page: current,
    pages,
  };
}

// view: "c" = comentários, "l" = curtidas
// avatars: Map(userId -> url da foto)
function buildInteractionsView({ messageId, post, view, page, pages, items, avatars }) {
  const isLikes = view === "l";
  const total = isLikes ? post.likes.length : post.comments.length;

  const toggle = new ButtonBuilder()
    .setCustomId(`post_switch:${messageId}:${isLikes ? "c" : "l"}`)
    .setLabel(isLikes ? "Comentários" : "Curtidas")
    .setEmoji(isLikes ? EMOJIS.comment : EMOJIS.like)
    .setStyle(ButtonStyle.Secondary);

  const container = new ContainerBuilder().addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        text(isLikes ? "### Curtidas" : "### Comentários"),
        text(
          isLikes
            ? `-# ${total} ${total === 1 ? "curtida" : "curtidas"} neste post.`
            : `-# ${total} ${total === 1 ? "comentário" : "comentários"} neste post.`
        )
      )
      .setButtonAccessory(toggle)
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  if (total === 0) {
    container.addTextDisplayComponents(
      text(
        isLikes
          ? "Ninguém curtiu este post ainda. Seja a primeira pessoa a curtir!"
          : "Ainda não há comentários neste post. Seja a primeira pessoa a comentar!"
      )
    );
    return [container];
  }

  for (const item of items) {
    const userId = isLikes ? item : item.userId;
    const body = isLikes
      ? `**Usuário:** <@${userId}> · curtiu este post`
      : `**Autor:** <@${userId}> · ${item.text}`;

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(text(body))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatars.get(userId) ?? DEFAULT_AVATAR))
    );
  }

  container
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(text(`-# Página atual: ${page}`))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`post_nav:${messageId}:${view}:${page - 1}`)
          .setLabel("Voltar")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page <= 1),
        new ButtonBuilder()
          .setCustomId("post_page")
          .setLabel(`${page}/${pages}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`post_nav:${messageId}:${view}:${page + 1}`)
          .setLabel("Avançar")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= pages)
      )
    );

  return [container];
}

function buildPostMissing() {
  return [
    new ContainerBuilder().addTextDisplayComponents(
      text("### Post indisponível"),
      text("-# Este post não existe mais.")
    ),
  ];
}

module.exports = {
  buildPostsPanel,
  buildPostContainer,
  buildInteractionsView,
  buildPostMissing,
  paginate,
};
