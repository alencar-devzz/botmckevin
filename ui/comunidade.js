const {
  ContainerBuilder,
  TextDisplayBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
} = require("discord.js");
const { addBackButton } = require("./backButton");

function buildComunidadePanel() {
  const header = new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent("### Comunidade e interação"),
    new TextDisplayBuilder().setContent("-# Configurações da comunidade e interações.")
  );

  const selectContainer = new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent("**Selecione abaixo**"),
    new TextDisplayBuilder().setContent("-# Configurações de comunidade.")
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId("comunidade_menu")
    .setPlaceholder("Selecione uma opção")
    .addOptions(
      { label: "Portaria", description: "Boas-vindas, saídas, DM de entrada e filtro de contas.", value: "portaria" },
      { label: "Auto-roles", description: "Configure os cargos automáticos.", value: "autoroles" },
      { label: "Posts e Instagram", description: "Fotos e vídeos com curtidas e comentários.", value: "posts" },
      {
        label: "Calls temporárias",
        description: "Call própria para quem entra no gatilho e painel de gerenciamento.",
        value: "calls",
      },
      {
        label: "Comando cl",
        description: "Apaga as mensagens de quem digita cl. Quem usa, canais e limites.",
        value: "cl",
      }
    );

  const selectRow = new ActionRowBuilder().addComponents(select);
  selectContainer.addActionRowComponents(selectRow);

  addBackButton(selectContainer, "back_main");

  return [header, selectContainer];
}

module.exports = { buildComunidadePanel };
