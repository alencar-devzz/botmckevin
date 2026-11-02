const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  LabelBuilder,
  FileUploadBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");

// Helpers para montar modais no formato novo (Labels): campo de texto, select e upload

const clip = (value, max) => String(value ?? "").slice(0, max);

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
  if (placeholder) field.setPlaceholder(clip(placeholder, 100));
  if (value) field.setValue(clip(value, max));

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

function uploadLabel({ id, label, description, min = 0, max = 1, required = false }) {
  const upload = new FileUploadBuilder()
    .setCustomId(id)
    .setMinValues(min)
    .setMaxValues(max)
    .setRequired(required);

  const wrapper = new LabelBuilder().setLabel(label).setFileUploadComponent(upload);
  if (description) wrapper.setDescription(description);
  return wrapper;
}

function modal(customId, title, ...labels) {
  return new ModalBuilder().setCustomId(customId).setTitle(title).addLabelComponents(...labels);
}

module.exports = { clip, textLabel, selectLabel, uploadLabel, modal };
