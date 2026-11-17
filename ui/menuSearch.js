const {
  ContainerBuilder,
  TextDisplayBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
} = require("discord.js");
const { textLabel, modal } = require("./modalHelpers");
const { buildBackButton } = require("./backButton");
const { buildSearchButton, SEARCH_EMOJI } = require("./mainMenu");
const { searchCrumbLine } = require("./breadcrumb");

const SEARCH_MARKUP = `<:${SEARCH_EMOJI.name}:${SEARCH_EMOJI.id}>`;

const text = (content) => new TextDisplayBuilder().setContent(String(content).slice(0, 3500));
const clip = (value, max) => {
  const s = String(value ?? "");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};
const safe = (value) => String(value ?? "").replaceAll("`", "'").replace(/\s+/g, " ").trim();

// Modal aberto pelo botão "Buscar" do /menu
function buildSearchModal() {
  return modal(
    "menu_search_modal",
    "Buscar sistema",
    textLabel({
      id: "query",
      label: "O que você quer configurar?",
      description: "Pode digitar o nome inteiro ou só um pedaço.",
      max: 60,
      min: 2,
      required: true,
      placeholder: "Ex: ticket, portaria, convites, bump...",
    })
  );
}

// Voltar + Buscar ficam FORA do container, numa linha só, embaixo dele
function buildNavRow() {
  return buildBackButton("back_main").addComponents(buildSearchButton());
}

// Resultado da busca (só aparece quando a busca não leva direto a um sistema):
// container com as opções encontradas + select para abrir o sistema.
function buildSearchResults({ query, results }) {
  const shown = clip(safe(query), 60);
  const container = new ContainerBuilder();
  const crumb = searchCrumbLine(shown);

  if (!results.length) {
    container.addTextDisplayComponents(
      text(`### ${SEARCH_MARKUP} Nenhum sistema encontrado\n${crumb}`),
      text(`-# Não achei nada parecido com \`${shown}\`. Tente outra palavra ou só o começo do nome.`)
    );
    return [container, buildNavRow()];
  }

  const list = results
    .map((r) => `**${r.label}**\n-# ${r.parent ? `${r.parent} · ` : ""}${r.description}`)
    .join("\n");

  container.addTextDisplayComponents(
    text(`### ${SEARCH_MARKUP} Resultados da busca\n${crumb}`),
    text(`-# Você buscou por \`${shown}\`. Selecione abaixo o sistema que deseja configurar.`),
    text(list)
  );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("menu_search_pick")
        .setPlaceholder("Selecione o sistema")
        .addOptions(
          results.map((r) => ({
            label: clip(r.label, 100),
            description: clip(r.parent ? `${r.parent} · ${r.description}` : r.description, 100),
            value: r.key,
          }))
        )
    )
  );

  return [container, buildNavRow()];
}

module.exports = { buildSearchModal, buildSearchResults };
