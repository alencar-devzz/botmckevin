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
  StringSelectMenuBuilder,
} = require("discord.js");
const { addBackButton } = require("./backButton");
const { EMOJIS, emojiMarkup, resolveEmoji } = require("../utils/post/emojis");
const { KEYS, DEFAULT_BUTTONS, DEFAULT_ORDER } = require("../utils/post/store");

const BUTTON_LABELS = {
  like: "Curtir",
  comment: "Comentar",
  view: "Ver comentários/curtidas",
  delete: "Excluir",
};
const STYLE_LABELS = {
  secondary: "Cinza (sem cor)",
  primary: "Azul",
  success: "Verde",
  danger: "Vermelho",
};
const STYLE_MAP = {
  secondary: ButtonStyle.Secondary,
  primary: ButtonStyle.Primary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
};
const POSITION_LABELS = {
  top: "Topo (canto direito da embed)",
  bottom: "Rodapé (linha de botões)",
};

// Config padrão usada quando nenhuma é passada
const FALLBACK_CFG = {
  buttons: DEFAULT_BUTTONS,
  order: DEFAULT_ORDER,
  rowPosition: "below",
};

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

  const buttonsPanel = new ContainerBuilder()
    .addTextDisplayComponents(
      text("**Botões do post**"),
      text("-# Escolha um botão para trocar o emoji, a cor e a posição dele."),
      text(
        `-# Linha de botões: **${cfg.rowPosition === "above" ? "acima" : "abaixo"} da mídia**`
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("pcfg_pick")
          .setPlaceholder("Selecione um botão para editar")
          .addOptions(
            KEYS.map((key) => ({
              label: BUTTON_LABELS[key],
              description: `Cor: ${STYLE_LABELS[cfg.buttons[key].style]} · ${
                cfg.buttons[key].position === "top" ? "Topo" : "Rodapé"
              }`,
              value: key,
            }))
          )
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("pcfg_rowpos")
          .setLabel(
            cfg.rowPosition === "above" ? "Mover linha para baixo" : "Mover linha para cima"
          )
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("pcfg_reset_all")
          .setLabel("Restaurar padrão")
          .setStyle(ButtonStyle.Danger)
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

  return [header, config, buttonsPanel, info];
}

// ---------- Painel de um botão (emoji / cor / posição) ----------

function previewOf(cfg) {
  const render = (key) => emojiMarkup(resolveEmoji(cfg.buttons[key].emoji, EMOJIS[key])).trim();
  const top = KEYS.find((key) => cfg.buttons[key].position === "top");
  const row = cfg.order.filter((key) => cfg.buttons[key].position === "bottom").map(render);
  return [
    `Topo: ${top ? render(top) : "`nenhum`"}`,
    `Rodapé (${cfg.rowPosition === "above" ? "acima" : "abaixo"} da mídia): ${
      row.length ? row.join("  ") : "`nenhum`"
    }`,
  ].join("\n");
}

function buildPostButtonPanel(cfg, key) {
  const button = cfg.buttons[key];
  const emoji = resolveEmoji(button.emoji, EMOJIS[key]);
  const bottomKeys = cfg.order.filter((k) => cfg.buttons[k].position === "bottom");
  const index = bottomKeys.indexOf(key);

  const header = new ContainerBuilder().addTextDisplayComponents(
    text(`### Botão: ${BUTTON_LABELS[key]}`),
    text(
      `-# Emoji: ${emojiMarkup(emoji).trim()}${button.emoji ? "" : " (padrão)"} · Cor: ${
        STYLE_LABELS[button.style]
      } · Posição: ${POSITION_LABELS[button.position]}`
    )
  );

  const body = new ContainerBuilder()
    .addTextDisplayComponents(text("**Prévia da posição**"), text(previewOf(cfg)))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      text("**Cor**"),
      text("-# Escolha \"Cinza\" para remover a cor do botão.")
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`pcfg_color:${key}`)
          .setPlaceholder("Cor do botão")
          .addOptions(
            Object.entries(STYLE_LABELS).map(([value, label]) => ({
              label,
              value,
              default: button.style === value,
            }))
          )
      )
    )
    .addTextDisplayComponents(
      text("**Posição**"),
      text("-# Só um botão cabe no topo: ao escolher topo, o que estava lá volta para o rodapé.")
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`pcfg_pos:${key}`)
          .setPlaceholder("Posição do botão")
          .addOptions(
            Object.entries(POSITION_LABELS).map(([value, label]) => ({
              label,
              value,
              default: button.position === value,
            }))
          )
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`pcfg_emoji:${key}`)
          .setLabel("Alterar emoji")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`pcfg_left:${key}`)
          .setLabel("◀ Esquerda")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(button.position !== "bottom" || index <= 0),
        new ButtonBuilder()
          .setCustomId(`pcfg_right:${key}`)
          .setLabel("Direita ▶")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(button.position !== "bottom" || index === -1 || index >= bottomKeys.length - 1),
        new ButtonBuilder()
          .setCustomId(`pcfg_resetbtn:${key}`)
          .setLabel("Restaurar")
          .setStyle(ButtonStyle.Danger)
      )
    );
  addBackButton(body, "pcfg_back");

  return [header, body];
}

// ---------- O post (container sem cor) ----------

// post: { authorId, content, likes: [], comments: [] }
// mediaUrls: urls (ou attachment://nome) das fotos/vídeos
function buildPostButton(key, post, cfg) {
  const conf = cfg.buttons[key];
  const button = new ButtonBuilder()
    .setCustomId(`post_${key}`)
    .setEmoji(resolveEmoji(conf.emoji, EMOJIS[key]))
    .setStyle(STYLE_MAP[conf.style] ?? ButtonStyle.Secondary);

  if (key === "like") button.setLabel(String(post.likes.length));
  if (key === "comment") button.setLabel(String(post.comments.length));
  return button;
}

function buildPostContainer(post, mediaUrls, cfg = FALLBACK_CFG) {
  const container = new ContainerBuilder();
  const authorLine = text(`${emojiMarkup(EMOJIS.instagram)}<@${post.authorId}>`);

  // Botão do topo: canto direito, em cima da embed (padrão: ver comentários/curtidas)
  const topKey = KEYS.find((key) => cfg.buttons[key].position === "top");
  if (topKey) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(authorLine)
        .setButtonAccessory(buildPostButton(topKey, post, cfg))
    );
  } else {
    container.addTextDisplayComponents(authorLine);
  }

  if (post.content && post.content.trim()) {
    container.addTextDisplayComponents(text(clip(post.content, 3500)));
  }

  // Linha de botões do rodapé (na ordem configurada)
  const rowKeys = cfg.order.filter((key) => cfg.buttons[key].position === "bottom");
  const row = rowKeys.length
    ? new ActionRowBuilder().addComponents(rowKeys.map((key) => buildPostButton(key, post, cfg)))
    : null;

  container.addSeparatorComponents(new SeparatorBuilder());
  if (row && cfg.rowPosition === "above") container.addActionRowComponents(row);
  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      mediaUrls.map((url) => new MediaGalleryItemBuilder().setURL(url))
    )
  );
  if (row && cfg.rowPosition !== "above") {
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addActionRowComponents(row);
  }

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
  buildPostButtonPanel,
  buildPostContainer,
  buildInteractionsView,
  buildPostMissing,
  paginate,
};
