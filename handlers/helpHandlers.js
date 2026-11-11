const { buildHelpPanel, PAGE_SIZE } = require("../ui/help");
const { collectHelp } = require("../utils/helpRegistry");

// Monta o painel do /help para quem interagiu. A lista é recalculada a cada clique,
// então comandos novos aparecem sozinhos (botão de atualizar) e cada pessoa só vê o que pode usar.
async function renderHelp(interaction, { cat = "all", page = 0, selected = null } = {}) {
  const data = await collectHelp(interaction);
  return buildHelpPanel({ prefix: data.prefix, commands: data.commands, categories: data.categories, cat, page, selected });
}

// customId: help:cat · help:cmd:<categoria>:<página>
async function handleHelpSelect(interaction) {
  const [, kind, cat, page] = interaction.customId.split(":");
  const value = interaction.values?.[0];

  if (kind === "cat") {
    return interaction.update({ components: await renderHelp(interaction, { cat: value, page: 0 }) });
  }

  if (kind === "cmd") {
    // Abre os detalhes na página onde o comando está
    const data = await collectHelp(interaction);
    const filtered = cat === "all" ? data.commands : data.commands.filter((c) => c.categorySlug === cat);
    const index = filtered.findIndex((c) => c.key === value);
    const targetPage = index >= 0 ? Math.floor(index / PAGE_SIZE) : Number(page) || 0;
    return interaction.update({
      components: buildHelpPanel({
        prefix: data.prefix,
        commands: data.commands,
        categories: data.categories,
        cat,
        page: targetPage,
        selected: value,
      }),
    });
  }
}

// customId: help:nav:<categoria>:<página> · help:det:<categoria>:<página>:<comando> · help:noop
async function handleHelpButton(interaction) {
  const [, kind, cat, page, key] = interaction.customId.split(":");

  if (kind === "nav") {
    return interaction.update({ components: await renderHelp(interaction, { cat, page: Number(page) || 0 }) });
  }

  if (kind === "det") {
    return interaction.update({
      components: await renderHelp(interaction, { cat, page: Number(page) || 0, selected: key }),
    });
  }

  // help:noop (indicador de página) não faz nada
  return interaction.deferUpdate().catch(() => {});
}

module.exports = { renderHelp, handleHelpSelect, handleHelpButton };
