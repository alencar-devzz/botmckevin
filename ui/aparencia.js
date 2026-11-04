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
  StringSelectMenuBuilder,
  ActionRowBuilder,
} = require("discord.js");
const { addBackButton } = require("./backButton");
const { ACTIVITY_TYPES, PRESENCE_STATUS, missingFields } = require("../utils/botPresence");

const DEFAULT_AVATAR = "https://cdn.discordapp.com/embed/avatars/0.png";

const text = (content) => new TextDisplayBuilder().setContent(String(content).slice(0, 3500));
const sep = () => new SeparatorBuilder();
const yesNo = (value) => (value ? "Definido" : "Não definido");

// Texto curto e seguro para mostrar dentro de `crase`
function short(value, max = 60) {
  if (!value) return "Não definido";
  const clean = String(value).replaceAll("`", "'").replaceAll("\n", " ");
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function button(customId, label, { style = ButtonStyle.Secondary, disabled = false } = {}) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style).setDisabled(disabled);
}

// Linha de configuração: texto à esquerda, botão à direita
function item(lines, customId, label = "Abrir", opts = {}) {
  return new SectionBuilder()
    .addTextDisplayComponents(...lines.map(text))
    .setButtonAccessory(button(customId, label, opts));
}

// Texto à esquerda, foto à direita
function itemWithThumb(lines, url) {
  return new SectionBuilder()
    .addTextDisplayComponents(...lines.map(text))
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(url || DEFAULT_AVATAR));
}

function tabHeader(title, tabName) {
  return new ContainerBuilder().addTextDisplayComponents(
    text(`## ${title}`),
    text(`-# Você está na aba de configurações de **${tabName}** do bot.`)
  );
}

// ---------- Painel principal da aparência ----------

function buildAparenciaPanel({ prefix, name, statusText, avatarURL, hasAvatar, hasBanner }) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("## Aparência do bot"),
    text("-# Personalize a identidade do bot: avatar, banner, prefixo, nome e status.")
  );

  const overview = new ContainerBuilder().addSectionComponents(
    itemWithThumb(
      [
        "**Visão geral**",
        `**Nome:** \`${short(name)}\` · **Prefixo:** \`${short(prefix)}\`\n**Status:** \`${short(statusText)}\``,
        `**Avatar:** \`${yesNo(hasAvatar)}\` · **Banner:** \`${yesNo(hasBanner)}\``,
      ],
      avatarURL
    )
  );

  const avatar = new ContainerBuilder()
    .addSectionComponents(
      item(
        [
          "**Avatar e Banner**",
          `-# Foto de perfil e capa do bot · Avatar: \`${yesNo(hasAvatar)}\` · Banner: \`${yesNo(hasBanner)}\``,
        ],
        "apar_open:avatar"
      )
    );

  const prefixo = new ContainerBuilder().addSectionComponents(
    item(
      ["**Prefixo**", `-# Símbolo antes dos comandos de texto · Atual: \`${short(prefix)}\``],
      "apar_open:prefixo"
    )
  );

  const nome = new ContainerBuilder().addSectionComponents(
    item(["**Nome**", `-# Nome de exibição do bot · Atual: \`${short(name)}\``], "apar_open:nome")
  );

  const hasStatus = statusText && statusText !== "Nenhum";
  const status = new ContainerBuilder()
    .addSectionComponents(
      item(
        ["**Status**", `-# Atividade exibida abaixo do nome · Atual: \`${short(statusText)}\``],
        "apar_open:status"
      )
    );
  addBackButton(status, "back_main");

  return [header, overview, avatar, prefixo, nome, status];
}

// ---------- Avatar e Banner ----------

function buildAvatarBannerPanel({ hasAvatar, hasBanner, avatarURL, bannerURL }) {
  const overview = new ContainerBuilder().addTextDisplayComponents(
    text("**Situação atual**"),
    text(`**Avatar:** \`${yesNo(hasAvatar)}\` · **Banner:** \`${yesNo(hasBanner)}\``),
    text(
      "-# Formatos aceitos: png, jpg, gif ou webp. Envie um arquivo ou o link de uma imagem. O Discord limita trocas frequentes."
    )
  );

  const avatar = new ContainerBuilder()
    .addSectionComponents(
      itemWithThumb(
        [
          "### Avatar",
          "-# Foto de perfil do bot, exibida nas mensagens e na lista de membros.",
          `-# Estado: \`${yesNo(hasAvatar)}\``,
        ],
        avatarURL
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        button("apar_avatar_set", "Definir", { disabled: hasAvatar }),
        button("apar_avatar_del", "Remover", { style: ButtonStyle.Danger, disabled: !hasAvatar })
      )
    );

  const banner = new ContainerBuilder()
    .addTextDisplayComponents(
      text("### Banner"),
      text("-# Capa exibida no topo do perfil do bot."),
      text(`-# Estado: \`${yesNo(hasBanner)}\``)
    );
  if (hasBanner && bannerURL) {
    banner.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(bannerURL))
    );
  }
  banner.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      button("apar_banner_set", "Definir", { disabled: hasBanner }),
      button("apar_banner_del", "Remover", { style: ButtonStyle.Danger, disabled: !hasBanner })
    )
  );
  addBackButton(banner, "apar_back");

  return [tabHeader("Avatar e Banner", "Avatar e Banner"), overview, avatar, banner];
}

// ---------- Prefixo ----------

function buildPrefixoPanel({ prefix }) {
  const p = short(prefix, 5);

  const container = new ContainerBuilder()
    .addSectionComponents(
      item(
        [
          "### Prefixo",
          "-# Símbolo que vem antes dos comandos de texto do bot.",
          `**Atual:** \`${p}\``,
        ],
        "apar_prefixo_set",
        "Alterar"
      )
    )
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      text("**Exemplos de uso**"),
      text(`-# \`${p}menu\` · \`${p}limpar\` · \`${p}regras\``),
      text("-# Até 5 caracteres, sem espaços. A mudança vale para este servidor.")
    );
  addBackButton(container, "apar_back");

  return [tabHeader("Prefixo", "Prefixo"), container];
}

// ---------- Nome ----------

function buildNomePanel({ name, avatarURL }) {
  const container = new ContainerBuilder();
  container.addSectionComponents(
    item(
      [
        "### Nome",
        "-# Nome de exibição do bot no servidor.",
        `**Atual:** \`${short(name, 32)}\``,
      ],
      "apar_nome_set",
      "Alterar"
    )
  );
  container
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      text("**Antes de alterar**"),
      text("-# Use entre 2 e 32 caracteres. O Discord limita trocas de nome com frequência.")
    );
  addBackButton(container, "apar_back");

  return [tabHeader("Nome", "Nome"), container];
}

// ---------- Status (tela inicial) ----------

function buildStatusPanel({ statusText }) {
  const hasStatus = statusText && statusText !== "Nenhum";

  const container = new ContainerBuilder()
    .addSectionComponents(
      item(
        [
          "### Status",
          "-# Atividade exibida abaixo do nome do bot (Jogando, Ouvindo, Assistindo...).",
          `**Atual:** \`${short(statusText)}\``,
        ],
        "apar_status_cfg",
        "Configurações"
      )
    );
  addBackButton(container, "apar_back");

  return [tabHeader("Status", "Status"), container];
}

// ---------- Status (configurar o tipo escolhido) ----------

function buildStatusConfigPanel({ cfg }) {
  const kind = cfg.presenceActivity;
  const info = ACTIVITY_TYPES[kind];
  const missing = missingFields(cfg);

  const lines = [];
  if (kind === "custom") {
    lines.push(`**Texto:** \`${short(cfg.presenceState)}\``);
  } else {
    lines.push(`**Texto:** \`${short(cfg.presenceName)}\``);
    if (kind === "streaming") lines.push(`**Link:** \`${short(cfg.presenceUrl)}\``);
    lines.push(`**Linha extra:** \`${short(cfg.presenceState)}\``);
  }
  lines.push(`**Presença:** \`${PRESENCE_STATUS[cfg.presenceStatus || "online"].label}\``);

  // Verde = status ativo, vermelho = falta preencher algum campo
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(`### ${info.label}`), text(`-# ${info.hint}`), text(lines.join("\n")));

  if (missing.length) {
    container.addTextDisplayComponents(
      text(`-# Defina o(s) campo(s) pendente(s) para ativar: **${missing.join(", ")}**.`)
    );
  }

  container.addSeparatorComponents(sep());
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(button("apar_status_text", info.textButton))
  );

  const presenceSelect = new StringSelectMenuBuilder()
    .setCustomId("apar_status_presenca")
    .setPlaceholder("Presença do bot")
    .addOptions(
      Object.entries(PRESENCE_STATUS).map(([value, p]) => ({
        label: p.label,
        description: p.description,
        value,
        default: value === (cfg.presenceStatus || "online"),
      }))
    );
  container.addActionRowComponents(new ActionRowBuilder().addComponents(presenceSelect));

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      button("apar_status_cfg", "Alterar tipo"),
      button("apar_status_clear", "Remover status", { style: ButtonStyle.Danger })
    )
  );
  addBackButton(container, "apar_open:status");

  return [tabHeader("Status", "Status"), container];
}

module.exports = {
  buildAparenciaPanel,
  buildAvatarBannerPanel,
  buildPrefixoPanel,
  buildNomePanel,
  buildStatusPanel,
  buildStatusConfigPanel,
};
