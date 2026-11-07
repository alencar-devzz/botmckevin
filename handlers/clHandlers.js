const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");
const { getClConfig, updateClConfig, resetClConfig } = require("../utils/cl/store");
const { buildClHome, buildClRoles, buildClChannels, buildValuesModal } = require("../ui/clConfig");

const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL = MessageFlags.Ephemeral;

// Quem configura: Administrador ou cargos da equipe
async function guard(interaction) {
  const member = interaction.member;
  const allowed =
    member?.permissions?.has(PermissionFlagsBits.Administrator) ||
    member?.roles?.cache?.hasAny(...ALL_STAFF_ROLE_IDS);
  if (allowed) return true;

  await interaction.reply({
    content: "Você não tem permissão para configurar o comando cl.",
    flags: EPHEMERAL,
  });
  return false;
}

const deny = (interaction, content) => {
  const payload = { content, flags: EPHEMERAL };
  return interaction.replied || interaction.deferred ? interaction.followUp(payload) : interaction.reply(payload);
};

const homePanel = async (guild) => buildClHome(guild, await getClConfig(guild.id));

async function openClPanel(interaction) {
  if (!(await guard(interaction))) return;
  return interaction.update({ components: await homePanel(interaction.guild) });
}

const NEXT_ACCESS = { staff: "roles", roles: "everyone", everyone: "staff" };

// Botões que apenas alternam um campo
const TOGGLES = {
  clcfg_toggle: "enabled",
  clcfg_old: "includeOld",
  clcfg_pinned: "skipPinned",
  clcfg_trigger: "deleteTrigger",
  clcfg_notice: "notice",
  clcfg_log: "sendLog",
};

async function handleClConfigButton(interaction) {
  if (!(await guard(interaction))) return;
  const { guild } = interaction;
  const [action, arg] = interaction.customId.split(":");
  const cfg = await getClConfig(guild.id);

  if (TOGGLES[action]) {
    await updateClConfig(guild.id, { [TOGGLES[action]]: !cfg[TOGGLES[action]] });
    return interaction.update({ components: await homePanel(guild) });
  }

  switch (action) {
    case "clcfg_home":
      return interaction.update({ components: await homePanel(guild) });

    case "clcfg_access":
      await updateClConfig(guild.id, { access: NEXT_ACCESS[cfg.access] });
      return interaction.update({ components: await homePanel(guild) });

    case "clcfg_scope":
      await updateClConfig(guild.id, { scope: cfg.scope === "guild" ? "channel" : "guild" });
      return interaction.update({ components: await homePanel(guild) });

    case "clcfg_page":
      return interaction.update({
        components: arg === "roles" ? buildClRoles(guild, cfg) : buildClChannels(guild, cfg),
      });

    case "clcfg_edit":
      return interaction.showModal(buildValuesModal(cfg));

    case "clcfg_reset":
      await resetClConfig(guild.id);
      return interaction.update({ components: await homePanel(guild) });

    default:
      return;
  }
}

async function handleClConfigSelect(interaction) {
  if (!(await guard(interaction))) return;
  const { guild, customId, values } = interaction;

  // Listas de cargos e canais (podem ficar vazias)
  const fields = {
    clcfg_roles: ["roles", buildClRoles],
    clcfg_blockedroles: ["blockedRoles", buildClRoles],
    clcfg_cooldownroles: ["cooldownExemptRoles", buildClRoles],
    clcfg_allowedch: ["allowedChannels", buildClChannels],
    clcfg_blockedch: ["blockedChannels", buildClChannels],
  };
  const entry = fields[customId];
  if (!entry) return;

  const [field, build] = entry;
  const list = values.filter((id) => id !== guild.id); // nunca o @everyone
  const cfg = await updateClConfig(guild.id, { [field]: list });
  return interaction.update({ components: build(guild, cfg) });
}

// "" mantém o valor atual; texto inválido cancela com aviso
function readNumber(interaction, id, current, min, max, label) {
  let raw = "";
  try {
    raw = interaction.fields.getTextInputValue(id).trim();
  } catch {
    return { value: current };
  }
  if (!raw) return { value: current };
  if (!/^\d+$/.test(raw)) return { error: `${label}: use apenas números inteiros.` };
  const n = Number(raw);
  if (n < min || n > max) return { error: `${label}: use um valor entre ${min} e ${max}.` };
  return { value: n };
}

async function handleClConfigModal(interaction) {
  if (!(await guard(interaction))) return;
  const { guild } = interaction;
  const cfg = await getClConfig(guild.id);

  const fields = [
    ["amount", "amount", 0, 5000, "Quantidade"],
    ["scanLimit", "scanLimit", 100, 5000, "Mensagens examinadas"],
    ["cooldown", "cooldown", 0, 3600, "Espera entre usos"],
    ["noticeSeconds", "noticeSeconds", 1, 60, "Tempo do aviso"],
  ];

  const patch = {};
  for (const [id, key, min, max, label] of fields) {
    const result = readNumber(interaction, id, cfg[key], min, max, label);
    if (result.error) return deny(interaction, result.error);
    patch[key] = result.value;
  }

  await updateClConfig(guild.id, patch);
  const components = await homePanel(guild);
  if (interaction.isFromMessage()) return interaction.update({ components });
  return interaction.reply({ components, flags: V2 | EPHEMERAL });
}

module.exports = { openClPanel, handleClConfigButton, handleClConfigSelect, handleClConfigModal };
