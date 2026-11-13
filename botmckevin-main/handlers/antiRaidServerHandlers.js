const { MessageFlags } = require("discord.js");
const { getAntiRaidConfig, updateAntiRaidConfig } = require("../utils/antiraid/store");
const D = require("../utils/antiraid/defaults");
const { takeSnapshot } = require("../utils/antiraid/visual");
const native = require("../utils/antiraid/native");
const { buildNotice } = require("../ui/antiraid");
const {
  buildVisualPanel,
  buildNativePanel,
  buildNativeChannelsPanel,
  buildAutoModPanel,
} = require("../ui/antiraidServer");

// Parte 5: Visual do servidor (ar:vs:*) e Ajustes do Discord (ar:nv:*).
// Estas ações chamam a API do Discord e podem passar de 3s, então respondem com deferUpdate
// e só depois redesenham o painel.

const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL = MessageFlags.Ephemeral;

const PANELS = {
  visual: buildVisualPanel,
  native: buildNativePanel,
  nativeChannels: buildNativeChannelsPanel,
  autoMod: buildAutoModPanel,
};

const pickKey = (values, map) => (values?.[0] in map ? values[0] : null);
const pickKeys = (values, map) => (values ?? []).filter((v) => v in map);

async function render(interaction, key) {
  const cfg = await getAntiRaidConfig(interaction.guild.id);
  const components = await PANELS[key](interaction.guild, cfg);
  return interaction.editReply({ components }).catch(() => {});
}

// Mostra o painel e, se algo deu errado, avisa só para quem clicou
async function finish(interaction, key, problem) {
  await render(interaction, key);
  if (problem) {
    await interaction.followUp({ components: buildNotice(String(problem).slice(0, 1500)), flags: V2 | EPHEMERAL }).catch(() => {});
  }
}

// ======================= Visual do servidor =======================

async function handleVisualButton(interaction) {
  const { guild } = interaction;
  await interaction.deferUpdate();
  const cfg = await getAntiRaidConfig(guild.id);
  let problem = null;

  if (interaction.customId === "ar:vs:toggle") {
    if (cfg.visual.enabled) {
      await updateAntiRaidConfig(guild.id, { "visual.enabled": false });
    } else {
      const { failed } = await takeSnapshot(guild);
      await updateAntiRaidConfig(guild.id, { "visual.enabled": true });
      if (failed.length) problem = savedWarning(failed);
    }
  } else if (interaction.customId === "ar:vs:snapshot") {
    const { failed } = await takeSnapshot(guild);
    if (failed.length) problem = savedWarning(failed);
  } else {
    return;
  }
  return finish(interaction, "visual", problem);
}

const savedWarning = (failed) =>
  `Não consegui guardar uma cópia de: ${failed.map((k) => D.VS_FIELDS[k]).join(", ")}. Na reversão eu tento usar o endereço antigo da imagem no Discord, que pode deixar de funcionar com o tempo.`;

async function handleVisualSelect(interaction) {
  const { guild } = interaction;
  const values = interaction.values ?? [];
  await interaction.deferUpdate();
  let patch = null;

  switch (interaction.customId) {
    case "ar:vs:fields":
      patch = { "visual.protect": pickKeys(values, D.VS_FIELDS) };
      break;
    case "ar:vs:response": {
      const key = pickKey(values, D.VS_RESPONSES);
      if (key) patch = { "visual.response": key };
      break;
    }
    case "ar:vs:users":
      patch = { "visual.authorizedUsers": values };
      break;
    case "ar:vs:roles":
      patch = { "visual.authorizedRoles": values };
      break;
    case "ar:vs:alert":
      patch = { "visual.alertChannelId": values[0] ?? null };
      break;
    default:
      return;
  }

  if (patch) await updateAntiRaidConfig(guild.id, patch);
  return finish(interaction, "visual");
}

// ======================= Ajustes do Discord =======================

async function handleNativeButton(interaction) {
  const [, , action, key] = interaction.customId.split(":"); // ar:nv:new:<regra>
  if (action !== "new" || !(key in D.NV_AUTOMOD)) return;

  await interaction.deferUpdate();
  const cfg = await getAntiRaidConfig(interaction.guild.id);
  const problem = await native.createPreset(interaction.guild, key, cfg.native, interaction.user);
  return finish(interaction, "autoMod", problem);
}

async function handleNativeSelect(interaction) {
  const { guild, user } = interaction;
  const values = interaction.values ?? [];
  await interaction.deferUpdate();

  const num = (map) => {
    const n = Number(values[0]);
    return n in map ? n : null;
  };
  let panel = "native";
  let problem = null;

  switch (interaction.customId) {
    case "ar:nv:verify": {
      const n = num(D.NV_VERIFICATION);
      if (n !== null) problem = await native.edit(guild, { verificationLevel: n }, user);
      break;
    }
    case "ar:nv:filter": {
      const n = num(D.NV_FILTER);
      if (n !== null) problem = await native.edit(guild, { explicitContentFilter: n }, user);
      break;
    }
    case "ar:nv:notify": {
      const n = num(D.NV_NOTIFY);
      if (n !== null) problem = await native.edit(guild, { defaultMessageNotifications: n }, user);
      break;
    }
    case "ar:nv:system":
      problem = await native.setSystemMessages(guild, pickKeys(values, D.NV_SYSTEM), user);
      break;

    // ---- canais ----
    case "ar:nv:sysch":
      panel = "nativeChannels";
      problem = await native.edit(guild, { systemChannel: values[0] ?? null }, user);
      break;
    case "ar:nv:safety":
      panel = "nativeChannels";
      problem = await native.edit(guild, { safetyAlertsChannel: values[0] ?? null }, user);
      break;
    case "ar:nv:rules":
      panel = "nativeChannels";
      problem = await native.edit(guild, { rulesChannel: values[0] ?? null }, user);
      break;
    case "ar:nv:updates":
      panel = "nativeChannels";
      problem = await native.edit(guild, { publicUpdatesChannel: values[0] ?? null }, user);
      break;

    // ---- AutoMod ----
    case "ar:nv:enabled": {
      panel = "autoMod";
      const rules = await native.fetchRules(guild);
      const shown = rules ? [...rules.keys()].slice(0, 25) : [];
      problem = await native.syncEnabled(guild, shown, values, user);
      break;
    }
    case "ar:nv:mention": {
      panel = "autoMod";
      const n = Number(values[0]);
      if (D.NV_MENTION_LIMITS.includes(n)) {
        await updateAntiRaidConfig(guild.id, { "native.mentionLimit": n });
        problem = await native.setMentionLimit(guild, n, user);
      }
      break;
    }
    case "ar:nv:xroles":
      panel = "autoMod";
      await updateAntiRaidConfig(guild.id, { "native.exemptRoles": values });
      problem = await native.setExemptRoles(guild, values, user);
      break;
    case "ar:nv:alert":
      panel = "autoMod";
      await updateAntiRaidConfig(guild.id, { "native.alertChannelId": values[0] ?? null });
      break;
    default:
      return;
  }

  return finish(interaction, panel, problem);
}

module.exports = {
  PANELS,
  handleVisualButton,
  handleVisualSelect,
  handleNativeButton,
  handleNativeSelect,
};
