const {
  ContainerBuilder,
  TextDisplayBuilder,
  RoleSelectMenuBuilder,
  ActionRowBuilder,
} = require("discord.js");
const { addBackButton } = require("./backButton");

function buildAutoRolesPanel(config) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent("### Auto-roles"),
    new TextDisplayBuilder().setContent(
      "-# Configure os cargos que irão ser setados automaticamente quando alguém entrar."
    )
  );

  const rolesContainer = new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent("**Cargos automáticos**"),
    new TextDisplayBuilder().setContent("-# Selecione até 5 cargos automáticos."),
    new TextDisplayBuilder().setContent(
      `-# Atuais: \`${
        config.autoRoles.length ? config.autoRoles.map((r) => `<@&${r}>`).join(", ") : "Nenhum"
      }\``
    )
  );
  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId("autoroles_select")
    .setPlaceholder("Selecione até 5 cargos")
    .setMinValues(0)
    .setMaxValues(5);
  rolesContainer.addActionRowComponents(
    new ActionRowBuilder().addComponents(roleSelect)
  );

  addBackButton(rolesContainer, "back_comunidade");

  return [header, rolesContainer];
}

module.exports = { buildAutoRolesPanel };
