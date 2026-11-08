const {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  LabelBuilder,
} = require("discord.js");
const { SECTIONS } = require("../utils/callHubDefaults");

// Painel de gerenciamento da call (Components V2, sem cor por padrão, sem emojis).
// Todos os textos vêm da configuração: n!menu → Comunidade e interação → Calls temporárias → Painel.

const text = (content) => new TextDisplayBuilder().setContent(String(content).slice(0, 3000));
const clip = (value, max) => String(value ?? "").slice(0, max);

const btn = (id, label) =>
  new ButtonBuilder().setCustomId(id).setLabel(clip(label, 80) || "-").setStyle(ButtonStyle.Secondary);

function resolveThumb(cfg, guild) {
  const mode = cfg.thumbnail;
  if (mode === "none") return null;
  if (mode && /^https?:\/\//i.test(mode)) return mode;
  return guild.iconURL({ extension: "png", size: 256 }) ?? null;
}

// ---------- Painel principal (mensagem pública) ----------

function buildCallPanel(cfg, guild) {
  const t = cfg.texts;
  const container = new ContainerBuilder();
  if (Number.isInteger(cfg.color)) container.setAccentColor(cfg.color);

  const title = text(`## ${clip(t.title, 100)}`);
  const desc = text(clip(t.desc, 300));
  const thumb = resolveThumb(cfg, guild);
  if (thumb) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(title, desc)
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumb))
    );
  } else {
    container.addTextDisplayComponents(title, desc);
  }
  container.addSeparatorComponents(new SeparatorBuilder());

  SECTIONS.forEach((section, index) => {
    const lines = section.keys.map((key) => `› **${clip(t[`b_${key}`], 80)}** — ${clip(t[`d_${key}`], 150)}`);
    container.addTextDisplayComponents(text(`### ${clip(t[section.titleKey], 100)}`), text(lines.join("\n")));
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(...section.keys.map((key) => btn(`cpn_${key}`, t[`b_${key}`])))
    );
    if (index < SECTIONS.length - 1) container.addSeparatorComponents(new SeparatorBuilder());
  });

  if (t.footer && t.footer.toLowerCase() !== "nenhum") {
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(text(clip(t.footer, 300)));
  }

  return [container];
}

// ---------- Respostas efêmeras ----------

function buildNotice(content) {
  return [new ContainerBuilder().addTextDisplayComponents(text(content))];
}

// Seletor de pessoas. defaults = ids já marcados (até 25)
function buildPicker({ action, title, hint, min = 1, max = 1, defaults = [], extraButton = null }) {
  const select = new UserSelectMenuBuilder()
    .setCustomId(`cpn_pick:${action}`)
    .setPlaceholder("Selecione")
    .setMinValues(min)
    .setMaxValues(max);
  if (defaults.length) select.setDefaultUsers(...defaults.slice(0, 25));

  const container = new ContainerBuilder().addTextDisplayComponents(
    text(`### ${clip(title, 100)}`),
    text(hint)
  );
  container.addActionRowComponents(new ActionRowBuilder().addComponents(select));
  if (extraButton) {
    container.addActionRowComponents(new ActionRowBuilder().addComponents(btn(extraButton.id, extraButton.label)));
  }
  return [container];
}

function buildLimitModal(current) {
  const input = new TextInputBuilder()
    .setCustomId("limit")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(2)
    .setPlaceholder("Ex.: 5");
  if (current) input.setValue(String(current));

  return new ModalBuilder()
    .setCustomId("cpn_modal:limit")
    .setTitle("Limite da call")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Máximo de pessoas")
        .setDescription("De 1 a 99. Use 0 para não ter limite.")
        .setTextInputComponent(input)
    );
}

module.exports = { buildCallPanel, buildNotice, buildPicker, buildLimitModal };
