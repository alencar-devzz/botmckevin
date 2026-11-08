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
  SeparatorSpacingSize,
} = require("discord.js");
const { SECTIONS } = require("../utils/callHubDefaults");

// Painel de gerenciamento da call (Components V2, sem cor por padrão, sem emojis).
// Todos os textos vêm da configuração: n!menu → Comunidade e interação → Calls temporárias → Painel.

const text = (content) => new TextDisplayBuilder().setContent(String(content).slice(0, 3000));
const clip = (value, max) => String(value ?? "").slice(0, max);

// Cores configuráveis em n!menu → Calls temporárias → Painel da call
const STYLE_MAP = {
  blue: ButtonStyle.Primary,
  gray: ButtonStyle.Secondary,
  green: ButtonStyle.Success,
  red: ButtonStyle.Danger,
};

const btn = (id, label, style = ButtonStyle.Secondary) =>
  new ButtonBuilder().setCustomId(id).setLabel(clip(label, 80) || "-").setStyle(style);

// Botão com o nome "-" ou "nenhum" fica escondido do painel
const isHidden = (t, key) => /^(-|nenhum)$/i.test(String(t[`b_${key}`] ?? "").trim());

const gap = (cfg) =>
  new SeparatorBuilder()
    .setDivider(cfg.dividers)
    .setSpacing(cfg.dividers ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);
const tight = () => new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small);

function resolveThumb(cfg, guild) {
  const mode = cfg.thumbnail;
  if (mode === "none") return null;
  if (mode && /^https?:\/\//i.test(mode)) return mode;
  return guild.iconURL({ extension: "png", size: 256 }) ?? null;
}

// ---------- Painel principal (mensagem pública) ----------

// disabled = true na pré-visualização do n!menu (botões visíveis, mas sem clique)
function buildCallPanel(cfg, guild, { disabled = false } = {}) {
  const t = cfg.texts;
  const container = new ContainerBuilder();
  if (Number.isInteger(cfg.color)) container.setAccentColor(cfg.color);

  // Cabeçalho: título grande, descrição (em citação ou texto normal) e a miniatura à direita
  const descText = clip(t.desc, 300);
  const title = text(`# ${clip(t.title, 100)}`);
  const desc = text(cfg.quoteDesc ? `> ${descText.replace(/\n/g, "\n> ")}` : descText);
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

  // Cada bloco: título, legenda compacta (opcional) e uma única fileira de botões
  for (const section of SECTIONS) {
    const keys = section.keys.filter((key) => !isHidden(t, key));
    if (!keys.length) continue;

    container.addSeparatorComponents(gap(cfg));

    const rawTitle = clip(t[section.titleKey], 100);
    const heading = `**${cfg.upperTitles ? rawTitle.toUpperCase() : rawTitle}**`;
    const legend = cfg.legend
      ? "\n" +
        keys
          .map((key) => {
            const detail = clip(t[`d_${key}`], 150);
            return `-# \`${clip(t[`b_${key}`], 40)}\`${detail ? `  ${detail}` : ""}`;
          })
          .join("\n")
      : "";
    container.addTextDisplayComponents(text(`${heading}${legend}`));

    container.addSeparatorComponents(tight());
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        ...keys.map((key) => btn(`cpn_${key}`, t[`b_${key}`], STYLE_MAP[cfg.styles?.[key]] ?? ButtonStyle.Secondary).setDisabled(disabled)
        )
      )
    );
  }

  if (t.footer && t.footer.toLowerCase() !== "nenhum") {
    container.addSeparatorComponents(gap(cfg));
    container.addTextDisplayComponents(text(clip(t.footer, 300)));
  }

  return [container];
}

// ---------- Respostas efêmeras ----------

function buildNotice(content) {
  return [new ContainerBuilder().addTextDisplayComponents(text(content))];
}

// Seletor de pessoas. defaults = ids já marcados (até 25)
function buildPicker({ action, title, hint, placeholder = "Selecione", min = 1, max = 1, defaults = [], extraButton = null }) {
  const select = new UserSelectMenuBuilder()
    .setCustomId(`cpn_pick:${action}`)
    .setPlaceholder(clip(placeholder, 100))
    .setMinValues(min)
    .setMaxValues(max);
  if (defaults.length) select.setDefaultUsers(...defaults.slice(0, 25));

  const container = new ContainerBuilder().addTextDisplayComponents(
    text(`## ${clip(title, 100)}`),
    text(`-# ${clip(hint, 300)}`)
  );
  container.addActionRowComponents(new ActionRowBuilder().addComponents(select));
  if (extraButton) {
    container.addActionRowComponents(new ActionRowBuilder().addComponents(btn(extraButton.id, extraButton.label)));
  }
  return [container];
}

// texts: { title, label, desc, placeholder } vindos de n!menu → Mensagens e respostas
function buildLimitModal(current, texts = {}) {
  const input = new TextInputBuilder()
    .setCustomId("limit")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(2)
    .setPlaceholder(clip(texts.placeholder ?? "Ex.: 5", 100));
  if (current) input.setValue(String(current));

  return new ModalBuilder()
    .setCustomId("cpn_modal:limit")
    .setTitle(clip(texts.title ?? "Limite da call", 45))
    .addLabelComponents(
      new LabelBuilder()
        .setLabel(clip(texts.label ?? "Máximo de pessoas", 45))
        .setDescription(clip(texts.desc ?? "De 1 a 99. Use 0 para não ter limite.", 100))
        .setTextInputComponent(input)
    );
}

module.exports = { buildCallPanel, buildNotice, buildPicker, buildLimitModal };
