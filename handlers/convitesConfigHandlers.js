const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");
const {
  getInviteConfig,
  updateInviteConfig,
  resetInviteConfig,
  setBonus,
  getBonus,
  addReward,
  removeRewards,
} = require("../utils/invites/configStore");
const { getGuildOverview } = require("../utils/invites/store");
const {
  buildInviteHome,
  buildInviteRewards,
  buildInviteRewardPick,
  buildInviteSettings,
  buildFakeDaysModal,
  buildBonusModal,
  buildRewardModal,
} = require("../ui/convitesConfig");

const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL = MessageFlags.Ephemeral;

// Quem configura: Administrador ou cargos da equipe (mesma regra dos outros painéis do n!menu)
async function guard(interaction) {
  const member = interaction.member;
  const allowed =
    member?.permissions?.has(PermissionFlagsBits.Administrator) ||
    member?.roles?.cache?.hasAny(...ALL_STAFF_ROLE_IDS);
  if (allowed) return true;

  await interaction.reply({
    content: "Você não tem permissão para configurar os convites.",
    flags: EPHEMERAL,
  });
  return false;
}

const deny = (interaction, content) => {
  const payload = { content, flags: EPHEMERAL };
  return interaction.replied || interaction.deferred ? interaction.followUp(payload) : interaction.reply(payload);
};

async function homePanel(guild) {
  const cfg = await getInviteConfig(guild.id);
  const overview = await getGuildOverview(guild.id, cfg.fakeDays);
  return buildInviteHome(guild, cfg, overview);
}

async function openInvitesConfigPanel(interaction) {
  if (!(await guard(interaction))) return;
  return interaction.update({ components: await homePanel(interaction.guild) });
}

async function handleInvitesConfigButton(interaction) {
  if (!(await guard(interaction))) return;
  const { guild } = interaction;
  const [action, arg] = interaction.customId.split(":");
  const cfg = await getInviteConfig(guild.id);

  switch (action) {
    case "invcfg_home":
      return interaction.update({ components: await homePanel(guild) });

    case "invcfg_toggle":
      await updateInviteConfig(guild.id, { enabled: !cfg.enabled });
      return interaction.update({ components: await homePanel(guild) });

    case "invcfg_announce_toggle":
      await updateInviteConfig(guild.id, { announceRewards: !cfg.announceRewards });
      return interaction.update({ components: buildInviteSettings(guild, await getInviteConfig(guild.id)) });

    case "invcfg_page":
      if (arg === "rewards") return interaction.update({ components: buildInviteRewards(guild, cfg) });
      if (arg === "settings") return interaction.update({ components: buildInviteSettings(guild, cfg) });
      return interaction.update({ components: await homePanel(guild) });

    case "invcfg_reward_add":
      return interaction.update({ components: buildInviteRewardPick(guild) });

    case "invcfg_edit":
      if (arg === "fakedays") return interaction.showModal(buildFakeDaysModal(cfg));
      return;

    case "invcfg_reset":
      await resetInviteConfig(guild.id);
      return interaction.update({ components: await homePanel(guild) });

    default:
      return;
  }
}

async function handleInvitesConfigSelect(interaction) {
  if (!(await guard(interaction))) return;
  const { guild, customId, values } = interaction;
  const cfg = await getInviteConfig(guild.id);

  switch (customId) {
    case "invcfg_reward_role": {
      const roleId = values[0];
      const current = cfg.rewards.find((r) => r.roleId === roleId)?.invites;
      return interaction.showModal(buildRewardModal(roleId, current));
    }

    case "invcfg_reward_remove": {
      const updated = await removeRewards(guild.id, values);
      return interaction.update({ components: buildInviteRewards(guild, updated) });
    }

    case "invcfg_channel": {
      const updated = await updateInviteConfig(guild.id, { achievementsChannelId: values[0] ?? null });
      return interaction.update({ components: buildInviteSettings(guild, updated) });
    }

    case "invcfg_bonus_pick": {
      const userId = values[0];
      return interaction.showModal(buildBonusModal(userId, getBonus(cfg, userId)));
    }

    default:
      return;
  }
}

// "" mantém o valor atual (só usado no bônus); texto inválido cancela com aviso
function readInt(interaction, id, { min, max, allowEmpty = false, fallback = 0 }) {
  let raw = "";
  try {
    raw = interaction.fields.getTextInputValue(id).trim();
  } catch {
    return { value: fallback };
  }
  if (!raw) {
    if (allowEmpty) return { value: fallback };
    return { error: "Preencha um número." };
  }
  if (!/^-?\d+$/.test(raw)) return { error: "Use apenas números inteiros." };
  const n = Number(raw);
  if (n < min || n > max) return { error: `Use um valor entre ${min} e ${max}.` };
  return { value: n };
}

async function handleInvitesConfigModal(interaction) {
  if (!(await guard(interaction))) return;
  const { guild, customId } = interaction;
  const [, action, arg] = customId.split(":"); // invcfg_modal:<ação>[:<extra>]

  const respond = async (components) => {
    if (interaction.isFromMessage()) return interaction.update({ components });
    return interaction.reply({ components, flags: V2 | EPHEMERAL });
  };

  if (action === "fakedays") {
    const current = await getInviteConfig(guild.id);
    const result = readInt(interaction, "days", { min: 0, max: 365, allowEmpty: true, fallback: current.fakeDays });
    if (result.error) return deny(interaction, result.error);
    await updateInviteConfig(guild.id, { fakeDays: result.value });
    return respond(await homePanel(guild));
  }

  if (action === "bonus") {
    const userId = arg;
    const result = readInt(interaction, "amount", { min: -1_000_000, max: 1_000_000, allowEmpty: true, fallback: 0 });
    if (result.error) return deny(interaction, result.error);
    await setBonus(guild.id, userId, result.value);
    return respond(buildInviteSettings(guild, await getInviteConfig(guild.id)));
  }

  if (action === "reward") {
    const roleId = arg;
    const result = readInt(interaction, "invites", { min: 1, max: 1_000_000 });
    if (result.error) return deny(interaction, result.error);
    const { cfg: updated, limited } = await addReward(guild.id, roleId, result.value);
    if (limited) return deny(interaction, "Máximo de 20 recompensas configuradas. Remova uma para adicionar outra.");
    return respond(buildInviteRewards(guild, updated));
  }

  return;
}

module.exports = {
  openInvitesConfigPanel,
  handleInvitesConfigButton,
  handleInvitesConfigSelect,
  handleInvitesConfigModal,
};
