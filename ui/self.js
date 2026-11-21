const { buildCategoryPanel } = require("./categoryPanel");

// Categoria "Self" do /menu (fica abaixo de Moderação).
// Fonte única: alimenta a lista do painel e a busca do menu (utils/menuSearch.js).
// Para adicionar um sistema: inclua um item aqui e trate o value em openSelfOption (handlers/selectHandlers.js).
const OPCOES = [
  {
    label: "Cargos por perfil",
    description: "Verificação de bio, status e pronomes com cargos automáticos.",
    value: "bio_panel",
    emoji: { name: "🪪" },
  },
];

function buildSelfPanel(page = 0) {
  return buildCategoryPanel({
    group: "self",
    title: "### Self",
    description: "Verificação de bio, status e pronomes com cargos automáticos.",
    options: OPCOES,
    page,
  });
}

module.exports = { buildSelfPanel, SELF_OPCOES: OPCOES };
