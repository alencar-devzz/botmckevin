const { MessageFlags } = require("discord.js");
const { buildSearchModal, buildSearchResults } = require("../ui/menuSearch");
const { searchSystems } = require("../utils/menuSearch");

// Botão "Buscar" do /menu: abre o modal (precisa ser a primeira resposta da interação)
function openSearchModal(interaction) {
  return interaction.showModal(buildSearchModal());
}

// Modal enviado: mostra os sistemas encontrados no lugar do menu (mesma mensagem efêmera)
async function handleSearchModal(interaction) {
  const query = interaction.fields.getTextInputValue("query").trim();
  const components = buildSearchResults({ query, results: searchSystems(query) });

  if (interaction.isFromMessage?.()) return interaction.update({ components });
  return interaction.reply({
    components,
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

module.exports = { openSearchModal, handleSearchModal };
