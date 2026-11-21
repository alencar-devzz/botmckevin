const {
  ContainerBuilder,
  TextDisplayBuilder,
  RoleSelectMenuBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { addBackButton } = require("./backButton");

// O botão "Ativar"/"Desativar" vira o toggle do canto do título (ícones on3/off3) pelo ui/breadcrumb.js
function buildAutoRolesPanel(config) {
  const enabled = config.autoRolesEnabled !== false;

  const header = new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent("### Auto-roles"),
    new TextDisplayBuilder().setContent(
      "-# Configure os cargos que irão ser setados automaticamente quando alguém entrar."
    ),
    new TextDisplayBuilder().setContent(
      `-# Sistema: **${enabled ? "ativado" : "desativado"}**${enabled ? "" : " · nenhum cargo está sendo entregue"}`
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

  rolesContainer.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("autoroles_toggle")
        .setLabel(enabled ? "Desativar" : "Ativar")
        .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success)
    )
  );

  addBackButton(rolesContainer, "back_comunidade");

  return [header, rolesContainer];
}

module.exports = { buildAutoRolesPanel };
