const { MessageFlags } = require("discord.js");
const { buildSearchModal, buildSearchResults } = require("../ui/menuSearch");
const { searchSystemsRanked, pickDirectMatch } = require("../utils/menuSearch");

// Botão "Buscar" do /menu: abre o modal (precisa ser a primeira resposta da interação)
function openSearchModal(interaction) {
  return interaction.showModal(buildSearchModal());
}

// Modal enviado:
//  - se a busca acha um sistema certo (ex.: "ticket"), abre direto a tela de configuração dele;
//  - se acha vários (ou nenhum), mostra a lista de sistemas encontrados no lugar do menu.
async function handleSearchModal(interaction) {
  const query = interaction.fields.getTextInputValue("query").trim();
  const ranked = searchSystemsRanked(query);

  const direct = pickDirectMatch(ranked);
  if (direct) {
    // require aqui dentro para não criar dependência circular com o selectHandlers
    const { openSystem } = require("./selectHandlers");
    return openSystem(interaction, direct.key);
  }

  const results = ranked.map(({ score, ...entry }) => entry);
  const components = buildSearchResults({ query, results });

  if (interaction.isFromMessage?.()) return interaction.update({ components });
  return interaction.reply({
    components,
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

module.exports = { openSearchModal, handleSearchModal };
