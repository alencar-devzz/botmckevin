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

// Cor de cada botão pela função: azul = acesso, vermelho = ação pesada, verde = configuração salva
const BUTTON_STYLES = {
  lock: ButtonStyle.Primary,
  unlock: ButtonStyle.Primary,
  limit: ButtonStyle.Primary,
  kick: ButtonStyle.Danger,
  blacklist: ButtonStyle.Danger,
  save: ButtonStyle.Success,
  load: ButtonStyle.Success,
};

const btn = (id, label, style = ButtonStyle.Secondary) =>
  new ButtonBuilder().setCustomId(id).setLabel(clip(label, 80) || "-").setStyle(style);

const softSeparator = () => new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small);
const hardSeparator = () => new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large);

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

  // Cabeçalho: título grande, descrição em citação e a miniatura à direita
  const title = text(`# ${clip(t.title, 100)}`);
  const desc = text(`> ${clip(t.desc, 300).replace(/\n/g, "\n> ")}`);
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

  // Cada bloco: título numerado em caixa alta, legenda compacta e uma única fileira de botões
  SECTIONS.forEach((section, index) => {
    container.addSeparatorComponents(hardSeparator());

    const heading = `**${String(index + 1).padStart(2, "0")}  ${clip(t[section.titleKey], 100).toUpperCase()}**`;
    const legend = section.keys
      .map((key) => `-# \`${clip(t[`b_${key}`], 40)}\`  ${clip(t[`d_${key}`], 150)}`)
      .join("\n");
    container.addTextDisplayComponents(text(`${heading}\n${legend}`));

    container.addSeparatorComponents(softSeparator());
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        ...section.keys.map((key) => btn(`cpn_${key}`, t[`b_${key}`], BUTTON_STYLES[key]))
      )
    );
  });

  if (t.footer && t.footer.toLowerCase() !== "nenhum") {
    container.addSeparatorComponents(hardSeparator());
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
    text(`## ${clip(title, 100)}`),
    text(`-# ${clip(hint, 300)}`)
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
