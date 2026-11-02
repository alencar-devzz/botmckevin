const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  LabelBuilder,
  FileUploadBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const { MAX_IMAGES } = require("../utils/ticketSettings");

// ---------- helpers (tudo em Labels: formato novo dos modais) ----------

function textLabel({
  id,
  label,
  description,
  style = TextInputStyle.Short,
  max,
  required = false,
  value,
  placeholder,
}) {
  const field = new TextInputBuilder()
    .setCustomId(id)
    .setStyle(style)
    .setRequired(required)
    .setMaxLength(max);
  if (placeholder) field.setPlaceholder(placeholder.slice(0, 100));
  if (value) field.setValue(String(value).slice(0, max));

  const wrapper = new LabelBuilder().setLabel(label).setTextInputComponent(field);
  if (description) wrapper.setDescription(description);
  return wrapper;
}

function selectLabel({
  id,
  label,
  description,
  options,
  min = 1,
  max = 1,
  required = true,
  placeholder,
}) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(id)
    .setMinValues(min)
    .setMaxValues(max)
    .addOptions(options);
  if (placeholder) menu.setPlaceholder(placeholder);
  if (typeof menu.setRequired === "function") menu.setRequired(required);

  const wrapper = new LabelBuilder().setLabel(label).setStringSelectMenuComponent(menu);
  if (description) wrapper.setDescription(description);
  return wrapper;
}

function modal(customId, title, ...labels) {
  return new ModalBuilder().setCustomId(customId).setTitle(title).addLabelComponents(...labels);
}

const clip = (value, max) => String(value ?? "").slice(0, max);

// ---------- textos do painel externo ----------

function buildPanelTextModal(s) {
  return modal(
    "tcfg_modal_panel_text",
    "Textos do painel externo",
    textLabel({
      id: "panel_title",
      label: "Título (opcional)",
      max: 100,
      value: s.panelTitle,
      placeholder: "Ex: Central de atendimento",
    }),
    textLabel({
      id: "panel_description",
      label: "Descrição (opcional)",
      style: TextInputStyle.Paragraph,
      max: 1000,
      value: s.panelDescription,
      placeholder: "Ex: Selecione abaixo o motivo do seu contato.",
    }),
    textLabel({
      id: "panel_placeholder",
      label: "Texto do select menu",
      description: "Deixe vazio para usar o padrão.",
      max: 100,
      value: s.panelPlaceholder === "Selecione uma opção" ? null : s.panelPlaceholder,
      placeholder: "Selecione uma opção",
    })
  );
}

// ---------- imagens: upload + manter/remover + links ----------
// kept = [{ label, description }] das imagens atuais (vazio = sem select)

function buildImagesModal({ customId, title, current = [] }) {
  const labels = [];

  if (current.length) {
    labels.push(
      selectLabel({
        id: "keep",
        label: "Imagens atuais",
        description: "Marcadas = mantidas. Desmarque para remover.",
        min: 0,
        max: Math.min(current.length, 25),
        required: false,
        options: current.slice(0, 25).map((item, index) => ({
          label: clip(item.label, 100),
          description: clip(item.description, 100),
          value: String(index),
          default: true,
        })),
      })
    );
  }

  const upload = new FileUploadBuilder()
    .setCustomId("upload")
    .setMinValues(0)
    .setMaxValues(MAX_IMAGES)
    .setRequired(false);

  labels.push(
    new LabelBuilder()
      .setLabel("Enviar imagens")
      .setDescription(`Até ${MAX_IMAGES} no total (png, jpg, gif ou webp, máx. 4 MB cada).`)
      .setFileUploadComponent(upload)
  );

  labels.push(
    textLabel({
      id: "links",
      label: "Links de imagens (opcional)",
      description: "Um link por linha. Somam com as imagens acima.",
      style: TextInputStyle.Paragraph,
      max: 1500,
      placeholder: "https://exemplo.com/imagem.png",
    })
  );

  return modal(customId, title, ...labels);
}

// ---------- ticket interno ----------

function buildInternalTextModal(s) {
  return modal(
    "tcfg_modal_int_text",
    "Textos do ticket interno",
    textLabel({
      id: "int_heading",
      label: "Título",
      description: "Deixe vazio para usar o padrão.",
      max: 100,
      value: s.internalHeading,
      placeholder: "Ticket - {username}",
    }),
    textLabel({
      id: "int_message",
      label: "Mensagem dentro do ticket",
      description: "Deixe vazio para usar o padrão.",
      style: TextInputStyle.Paragraph,
      max: 1000,
      value: s.internalMessage,
      placeholder: "Por favor, aguarde as instruções do staff responsável.",
    }),
    textLabel({
      id: "int_claimed",
      label: "Aviso ao assumir",
      description: "Deixe vazio para usar o padrão.",
      style: TextInputStyle.Paragraph,
      max: 300,
      value: s.claimedMessage,
      placeholder: "{staff} Assumiu este ticket e irá lhe atender.",
    }),
    textLabel({
      id: "int_thread",
      label: "Nome do tópico",
      description: "Deixe vazio para usar o padrão.",
      max: 100,
      value: s.threadName,
      placeholder: "{username}・N°{number}",
    })
  );
}

// ---------- opções do menu (com select de posição) ----------
// options = lista atual | position = índice (0-based) onde a opção ficará selecionada

function buildOptionModal({ customId, title, option = {}, options = [], position = 0 }) {
  const isEdit = Boolean(option.key);
  const total = isEdit ? options.length : options.length + 1;

  const positions = Array.from({ length: Math.max(1, Math.min(total, 25)) }, (_, i) => {
    const occupant = options[i];
    let description = "Última posição";
    if (occupant) {
      description = occupant.key === option.key ? "Posição atual" : `Hoje: ${occupant.label}`;
    }
    return {
      label: `Posição ${i + 1}`,
      description: clip(description, 100),
      value: String(i),
      default: i === position,
    };
  });

  return modal(
    customId,
    title,
    textLabel({
      id: "opt_label",
      label: "Nome da opção",
      max: 100,
      required: true,
      value: option.label,
      placeholder: "Ex: Suporte",
    }),
    textLabel({
      id: "opt_description",
      label: "Descrição no menu (opcional)",
      max: 100,
      value: option.description,
      placeholder: "Ex: Tire dúvidas ou peça ajuda da equipe",
    }),
    textLabel({
      id: "opt_title",
      label: "Título no ticket",
      description: "Deixe vazio para usar o nome em maiúsculas.",
      max: 100,
      value: option.title,
      placeholder: "Ex: SUPORTE",
    }),
    textLabel({
      id: "opt_message",
      label: "Mensagem própria no ticket (opcional)",
      description: "Vazio = usa a mensagem padrão do ticket interno.",
      style: TextInputStyle.Paragraph,
      max: 1000,
      value: option.message,
    }),
    selectLabel({
      id: "opt_position",
      label: "Posição no menu",
      description: "Onde esta opção aparece na lista do painel.",
      options: positions,
    })
  );
}

// ---------- remover várias opções de uma vez ----------

function buildRemoveOptionsModal(options) {
  return modal(
    "tcfg_modal_opt_remove",
    "Remover opções",
    selectLabel({
      id: "opt_remove",
      label: "Opções para remover",
      description: "O painel precisa manter pelo menos uma opção.",
      min: 1,
      max: Math.max(1, Math.min(options.length - 1, 25)),
      placeholder: "Selecione as opções",
      options: options.slice(0, 25).map((o) => {
        const item = { label: clip(o.label, 100), value: o.key };
        if (o.description) item.description = clip(o.description, 100);
        return item;
      }),
    })
  );
}

module.exports = {
  buildPanelTextModal,
  buildImagesModal,
  buildInternalTextModal,
  buildOptionModal,
  buildRemoveOptionsModal,
};
