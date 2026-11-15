const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require("discord.js");
const { TAG_ROLES } = require("../utils/tagRoles");

const NO_MENTIONS = { parse: [] };

const notice = (content) => [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(content))];

// Botões do painel do comando tag: cada um entrega o seu cargo e responde só para quem clicou
async function handleTagButton(interaction) {
  const [, key] = interaction.customId.split(":");
  const tag = TAG_ROLES.find((t) => t.key === key);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const respond = (content) =>
    interaction.editReply({
      components: notice(content),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: NO_MENTIONS,
    });

  if (!tag || !interaction.inGuild()) {
    return respond("Não consegui entregar esse cargo. Tente de novo ou chame a equipe.");
  }

  const role = `<@&${tag.roleId}>`;

  try {
    const member = interaction.member?.roles?.add
      ? interaction.member
      : await interaction.guild.members.fetch(interaction.user.id);

    if (member.roles.cache.has(tag.roleId)) {
      return respond(`Você já possui o cargo ${role}.`);
    }

    const target = interaction.guild.roles.cache.get(tag.roleId) ?? (await interaction.guild.roles.fetch(tag.roleId));
    if (!target) {
      return respond(`Não consegui entregar o cargo ${role}: ele não existe mais neste servidor. Avise a equipe.`);
    }
    if (!target.editable) {
      return respond(
        `Não consegui entregar o cargo ${role}: ele está acima do meu cargo ou eu não tenho a permissão de gerenciar cargos. Avise a equipe.`
      );
    }

    await member.roles.add(target, "Cargo escolhido no painel de tags");
    return respond(`Você recebeu o cargo ${role}.`);
  } catch (err) {
    console.error("[tag] Erro ao entregar cargo:", err);
    return respond(`Não consegui entregar o cargo ${role}. Tente de novo ou chame a equipe.`);
  }
}

module.exports = { handleTagButton };
