const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");
const { getGuildConfig } = require("../database/getGuildConfig");
const { buildAutoRolesPanel } = require("../ui/autoroles");

const EPHEMERAL = MessageFlags.Ephemeral;

// Quem configura: Administrador ou cargos da equipe
async function guard(interaction) {
  const member = interaction.member;
  const allowed =
    member?.permissions?.has(PermissionFlagsBits.Administrator) ||
    member?.roles?.cache?.hasAny(...ALL_STAFF_ROLE_IDS);
  if (allowed) return true;

  await interaction.reply({
    content: "Você não tem permissão para configurar os auto-roles.",
    flags: EPHEMERAL,
  });
  return false;
}

// Botão Ativar/Desativar do painel de Auto-roles (/menu > Comunidade e interação)
async function handleAutoRolesButton(interaction) {
  if (!(await guard(interaction))) return;

  if (interaction.customId === "autoroles_toggle") {
    const config = await getGuildConfig(interaction.guild.id);
    config.autoRolesEnabled = config.autoRolesEnabled === false;
    await config.save();
    return interaction.update({ components: buildAutoRolesPanel(config) });
  }
}

module.exports = { handleAutoRolesButton };
