const {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ActionRowBuilder,
} = require("discord.js");
const { addBackButton } = require("./backButton");
const { ACTIVITY_TYPES, PRESENCE_STATUS, missingFields } = require("../utils/botPresence");

const text = (content) => new TextDisplayBuilder().setContent(content);

// Texto curto e seguro para mostrar dentro de `crase`
function short(value, max = 60) {
  if (!value) return "Não definido";
  const clean = String(value).replaceAll("`", "'").replaceAll("\n", " ");
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

// Container com texto + botão "Abrir" ao lado
function openSection(lines, customId) {
  return new ContainerBuilder().addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(...lines.map(text))
      .setButtonAccessory(
        new ButtonBuilder().setCustomId(customId).setLabel("Abrir").setStyle(ButtonStyle.Secondary)
      )
  );
}

function button(customId, label, { style = ButtonStyle.Secondary, disabled = false } = {}) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style).setDisabled(disabled);
}

function tabHeader(title, tabName) {
  return new ContainerBuilder().addTextDisplayComponents(
    text(`## ${title}`),
    text(`-# Você está na aba de configurações de **${tabName}** do bot.`)
  );
}

// ---------- Painel principal da aparência ----------

function buildAparenciaPanel({ prefix, name, statusText }) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("## Aparência do bot"),
    text("-# Avatar, banner, prefixo, status e nome")
  );

  const avatar = openSection(
    ["**Avatar e Banner**", "-# Configurações de avatar do bot"],
    "apar_open:avatar"
  );

  const prefixo = openSection(
    ["**Prefixo**", `-# Configurações de prefixo do bot · Atual: \`${short(prefix)}\``],
    "apar_open:prefixo"
  );

  const nome = openSection(
    ["**Nome**", `-# Configurações de nome do bot · Atual: \`${short(name)}\``],
    "apar_open:nome"
  );

  const status = openSection(
    ["**Status**", `-# Configurações de status do bot · Atual: \`${short(statusText)}\``],
    "apar_open:status"
  );
  addBackButton(status, "back_main");

  return [header, new SeparatorBuilder(), avatar, prefixo, nome, status];
}

// ---------- Avatar e Banner ----------

function imageContainer({ title, description, kind, has }) {
  return new ContainerBuilder()
    .addTextDisplayComponents(text(`### ${title}`), text(`-# ${description}`))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        button(`apar_${kind}_set`, "Definir", { disabled: has }),
        button(`apar_${kind}_del`, "Remover", { style: ButtonStyle.Danger, disabled: !has })
      )
    );
}

function buildAvatarBannerPanel({ hasAvatar, hasBanner }) {
  const banner = imageContainer({
    title: "Banner",
    description: "Defina o Banner do bot",
    kind: "banner",
    has: hasBanner,
  });
  addBackButton(banner, "apar_back");

  return [
    tabHeader("Avatar e Banner", "Avatar e Banner"),
    imageContainer({
      title: "Avatar",
      description: "Defina o Avatar do bot",
      kind: "avatar",
      has: hasAvatar,
    }),
    banner,
  ];
}

// ---------- Prefixo ----------

function buildPrefixoPanel({ prefix }) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text("### Prefixo"),
      text("-# Defina um novo prefixo para o bot"),
      text(`-# Atual: \`${short(prefix)}\``)
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(button("apar_prefixo_set", "Definir")));
  addBackButton(container, "apar_back");

  return [tabHeader("Prefixo", "Prefixo"), container];
}

// ---------- Nome ----------

function buildNomePanel({ name }) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text("### Nome"),
      text("-# Defina um novo nome para o bot"),
      text(`-# Atual: \`${short(name)}\``)
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(button("apar_nome_set", "Definir")));
  addBackButton(container, "apar_back");

  return [tabHeader("Nome", "Nome"), container];
}

// ---------- Status (tela inicial) ----------

function buildStatusPanel({ statusText }) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text("### Status"),
      text("-# Defina um novo status para o bot"),
      text(`-# Atual: \`${short(statusText)}\``)
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(button("apar_status_cfg", "Configurações"))
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
    lines.push(`-# Texto: \`${short(cfg.presenceState)}\``);
  } else {
    lines.push(`-# Texto: \`${short(cfg.presenceName)}\``);
    if (kind === "streaming") lines.push(`-# Link: \`${short(cfg.presenceUrl)}\``);
    lines.push(`-# Linha extra: \`${short(cfg.presenceState)}\``);
  }
  lines.push(`-# Presença: \`${PRESENCE_STATUS[cfg.presenceStatus || "online"].label}\``);

  const container = new ContainerBuilder().addTextDisplayComponents(
    text(`### ${info.label}`),
    text(`-# ${info.hint}`),
    text(lines.join("\n"))
  );

  if (missing.length) {
    container.addTextDisplayComponents(
      text(`-# Defina o(s) campo(s) pendente(s) para ativar: **${missing.join(", ")}**.`)
    );
  }

  container.addSeparatorComponents(new SeparatorBuilder());
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
