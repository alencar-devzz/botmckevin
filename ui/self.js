const { buildCategoryPanel } = require("./categoryPanel");

// Categoria "Self" do /menu (fica abaixo de Moderação).
// Fonte única: alimenta a lista do painel e a busca do menu (utils/menuSearch.js).
// Para adicionar um sistema: inclua um item aqui e trate o value em openSelfOption (handlers/selectHandlers.js).
const OPCOES = [];

function buildSelfPanel(page = 0) {
  return buildCategoryPanel({
    group: "self",
    title: "### Self",
    description: "Configurações do Self.",
    options: OPCOES,
    page,
  });
}

module.exports = { buildSelfPanel, SELF_OPCOES: OPCOES };
