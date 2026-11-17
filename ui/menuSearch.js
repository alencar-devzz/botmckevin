const {
  ContainerBuilder,
  TextDisplayBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
} = require("discord.js");
const { textLabel, modal } = require("./modalHelpers");
const { addBackButton } = require("./backButton");
const { buildSearchButtonRow, SEARCH_EMOJI } = require("./mainMenu");

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

// Resultado da busca: container com as opções encontradas + select para abrir o sistema.
// O botão Buscar fica fora do container, igual ao menu principal.
function buildSearchResults({ query, results }) {
  const shown = clip(safe(query), 60);
  const container = new ContainerBuilder();

  if (!results.length) {
    container.addTextDisplayComponents(
      text(`### ${SEARCH_MARKUP} Nenhum sistema encontrado`),
      text(`-# Não achei nada parecido com \`${shown}\`. Tente outra palavra ou só o começo do nome.`)
    );
    addBackButton(container, "back_main");
    return [container, buildSearchButtonRow()];
  }

  const list = results
    .map((r) => `**${r.label}**\n-# ${r.parent ? `${r.parent} · ` : ""}${r.description}`)
    .join("\n");

  container.addTextDisplayComponents(
    text(`### ${SEARCH_MARKUP} Resultados da busca`),
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

  addBackButton(container, "back_main");
  return [container, buildSearchButtonRow()];
}

module.exports = { buildSearchModal, buildSearchResults };
