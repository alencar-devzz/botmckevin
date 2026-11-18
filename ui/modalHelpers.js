const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  LabelBuilder,
  FileUploadBuilder,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
} = require("discord.js");

// Helpers para montar modais no formato novo (Labels): campo de texto, select e upload

const clip = (value, max) => String(value ?? "").slice(0, max);

function textLabel({
  id,
  label,
  description,
  style = TextInputStyle.Short,
  max,
  min,
  required = false,
  value,
  placeholder,
}) {
  const field = new TextInputBuilder()
    .setCustomId(id)
    .setStyle(style)
    .setRequired(required)
    .setMaxLength(max);
  if (min) field.setMinLength(min);
  if (placeholder) field.setPlaceholder(clip(placeholder, 100));
  if (value) field.setValue(clip(value, max));

  const wrapper = new LabelBuilder().setLabel(clip(label, 45)).setTextInputComponent(field);
  if (description) wrapper.setDescription(clip(description, 100));
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

  const wrapper = new LabelBuilder().setLabel(clip(label, 45)).setStringSelectMenuComponent(menu);
  if (description) wrapper.setDescription(clip(description, 100));
  return wrapper;
}

// Select de usuários dentro do modal (o Discord devolve só os IDs escolhidos)
function userSelectLabel({ id, label, description, min = 0, max = 25, required = false, placeholder }) {
  const menu = new UserSelectMenuBuilder().setCustomId(id).setMinValues(min).setMaxValues(max);
  if (placeholder) menu.setPlaceholder(clip(placeholder, 100));
  if (typeof menu.setRequired === "function") menu.setRequired(required);

  const wrapper = new LabelBuilder().setLabel(clip(label, 45)).setUserSelectMenuComponent(menu);
  if (description) wrapper.setDescription(clip(description, 100));
  return wrapper;
}

function uploadLabel({ id, label, description, min = 0, max = 1, required = false }) {
  const upload = new FileUploadBuilder()
    .setCustomId(id)
    // O Discord rejeita campo obrigatório com min_values 0
    .setMinValues(required ? Math.max(1, min) : min)
    .setMaxValues(max)
    .setRequired(required);

  const wrapper = new LabelBuilder().setLabel(clip(label, 45)).setFileUploadComponent(upload);
  if (description) wrapper.setDescription(clip(description, 100));
  return wrapper;
}

function modal(customId, title, ...labels) {
  return new ModalBuilder().setCustomId(customId).setTitle(title).addLabelComponents(...labels);
}

module.exports = { clip, textLabel, selectLabel, userSelectLabel, uploadLabel, modal };
