const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require("discord.js");
const { MAX_IMAGES } = require("../utils/ticketSettings");

function input({ id, label, style = TextInputStyle.Short, max, required = false, value, placeholder }) {
  const field = new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required)
    .setMaxLength(max);
  if (placeholder) field.setPlaceholder(placeholder);
  if (value) field.setValue(String(value).slice(0, max));
  return new ActionRowBuilder().addComponents(field);
}

function buildPanelTextModal(s) {
  return new ModalBuilder()
    .setCustomId("tcfg_modal_panel_text")
    .setTitle("Textos do painel externo")
    .addComponents(
      input({
        id: "panel_title",
        label: "Título (opcional)",
        max: 100,
        value: s.panelTitle,
        placeholder: "Ex: Central de atendimento",
      }),
      input({
        id: "panel_description",
        label: "Descrição (opcional)",
        style: TextInputStyle.Paragraph,
        max: 1000,
        value: s.panelDescription,
        placeholder: "Ex: Selecione abaixo o motivo do seu contato.",
      }),
      input({
        id: "panel_placeholder",
        label: "Texto do select menu (vazio = padrão)",
        max: 100,
        value: s.panelPlaceholder === "Selecione uma opção" ? null : s.panelPlaceholder,
        placeholder: "Selecione uma opção",
      })
    );
}

function buildImagesModal({ customId, title, current, emptyHint }) {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(
      input({
        id: "images",
        label: `Links das imagens (até ${MAX_IMAGES}, um por linha)`,
        style: TextInputStyle.Paragraph,
        max: 1500,
        value: current.join("\n"),
        placeholder: `https://exemplo.com/imagem.png\n(${emptyHint})`,
      })
    );
}

function buildInternalTextModal(s) {
  return new ModalBuilder()
    .setCustomId("tcfg_modal_int_text")
    .setTitle("Textos do ticket interno")
    .addComponents(
      input({
        id: "int_heading",
        label: "Título (vazio = padrão)",
        max: 100,
        value: s.internalHeading,
        placeholder: "Ticket - {username}",
      }),
      input({
        id: "int_message",
        label: "Mensagem dentro do ticket (vazio = padrão)",
        style: TextInputStyle.Paragraph,
        max: 1000,
        value: s.internalMessage,
        placeholder: "Por favor, aguarde as instruções do staff responsável.",
      }),
      input({
        id: "int_claimed",
        label: "Aviso ao assumir (vazio = padrão)",
        style: TextInputStyle.Paragraph,
        max: 300,
        value: s.claimedMessage,
        placeholder: "{staff} Assumiu este ticket e irá lhe atender.",
      }),
      input({
        id: "int_thread",
        label: "Nome do tópico (vazio = padrão)",
        max: 100,
        value: s.threadName,
        placeholder: "📌・{username}・N°{number}",
      })
    );
}

function buildOptionModal({ customId, title, option = {} }) {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(
      input({
        id: "opt_label",
        label: "Nome da opção",
        max: 100,
        required: true,
        value: option.label,
        placeholder: "Ex: Suporte",
      }),
      input({
        id: "opt_description",
        label: "Descrição no menu (opcional)",
        max: 100,
        value: option.description,
        placeholder: "Ex: Tire dúvidas ou peça ajuda da equipe",
      }),
      input({
        id: "opt_title",
        label: "Título no ticket (vazio = nome em CAPS)",
        max: 100,
        value: option.title,
        placeholder: "Ex: SUPORTE",
      }),
      input({
        id: "opt_message",
        label: "Mensagem própria no ticket (opcional)",
        style: TextInputStyle.Paragraph,
        max: 1000,
        value: option.message,
        placeholder: "Vazio = usa a mensagem padrão do ticket interno.",
      })
    );
}

module.exports = {
  buildPanelTextModal,
  buildImagesModal,
  buildInternalTextModal,
  buildOptionModal,
};
