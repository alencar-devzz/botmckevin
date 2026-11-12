const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { getAntiRaidConfig, updateAntiRaidConfig } = require("../utils/antiraid/store");
const D = require("../utils/antiraid/defaults");
const { CORE_ACTIONS, CORE_LIMITS, CORE_WINDOWS, PUNISHMENTS } = D;
const { endLockdown } = require("../utils/antiraid/massJoin");
const { buildAntiRaidHome, buildAntiRaidHub, buildCorePanel, buildNotice } = require("../ui/antiraid");
const { buildMassJoinPanel, buildSpamPanel, buildSpamResponsePanel } = require("../ui/antiraidModules");
const { buildAntiBotPanel, buildAntiAltPanel } = require("../ui/antiraidAccess");
const { buildDangerPermsPanel, buildProtectedRolesPanel, buildMovCallPanel } = require("../ui/antiraidSensitive");
const server = require("./antiRaidServerHandlers");
const antiLink = require("./antiLinkHandlers");

const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL = MessageFlags.Ephemeral;

// Cada módulo registra aqui o seu painel. As próximas partes acrescentam linhas nesta lista.
const PANELS = {
  core: buildCorePanel,
  massJoin: buildMassJoinPanel,
  spam: buildSpamPanel,
  spamResp: buildSpamResponsePanel,
  antiBot: buildAntiBotPanel,
  antiAlt: buildAntiAltPanel,
  dangerPerms: buildDangerPermsPanel,
  protectedRoles: buildProtectedRolesPanel,
  movCall: buildMovCallPanel,
  // Parte 5: visual, native, nativeChannels e autoMod
  ...server.PANELS,
  // Anti-link: antiLink e antiLinkResp
  ...antiLink.PANELS,
};

// Valor numérico de um select, só se estiver na lista permitida
const pickNum = (values, list) => {
  const n = Number(values?.[0]);
  return list.includes(n) ? n : null;
};
const pickKey = (values, map) => (values?.[0] in map ? values[0] : null);
const pickKeys = (values, map) => (values ?? []).filter((v) => v in map);

// Só o dono ou quem tem Administrador mexe no Anti-Raid
const canManage = (member) =>
  member?.guild?.ownerId === member?.id || member?.permissions.has(PermissionFlagsBits.Administrator);

async function deny(interaction, content) {
  const payload = { components: buildNotice(content), flags: V2 | EPHEMERAL };
  if (interaction.deferred || interaction.replied) return interaction.followUp(payload).catch(() => {});
  return interaction.reply(payload).catch(() => {});
}

// Reabre o painel de um módulo já com a configuração atualizada
async function showPanel(interaction, key) {
  const cfg = await getAntiRaidConfig(interaction.guild.id);
  const components = await PANELS[key](interaction.guild, cfg); // o painel do AutoMod busca as regras
  return interaction.update({ components });
}

// ======================= Botões =======================

async function handleAntiRaidButton(interaction) {
  if (!canManage(interaction.member)) {
    return deny(interaction, "Só o dono ou quem tem Administrador pode configurar o Anti-Raid.");
  }

  const { customId, guild } = interaction;

  // Botão da mensagem pública: abre o menu geral só para quem clicou
  if (customId === "ar:open") {
    const cfg = await getAntiRaidConfig(guild.id);
    return interaction.reply({ components: buildAntiRaidHub(guild, cfg), flags: V2 | EPHEMERAL });
  }

  if (customId === "ar:home:refresh") {
    const cfg = await getAntiRaidConfig(guild.id);
    return interaction.update({ components: buildAntiRaidHome(guild, cfg) });
  }

  if (customId === "ar:hub") {
    const cfg = await getAntiRaidConfig(guild.id);
    return interaction.update({ components: buildAntiRaidHub(guild, cfg) });
  }

  if (customId === "ar:close") {
    return interaction.update({ components: buildNotice("Painel fechado. Use o botão da mensagem do painel para abrir de novo.") });
  }

  if (customId.startsWith("ar:mod:")) {
    const key = customId.slice("ar:mod:".length);
    if (!PANELS[key]) return deny(interaction, "Esse módulo ainda não está disponível.");
    return showPanel(interaction, key);
  }

  if (customId.startsWith("ar:core:")) return handleCoreButton(interaction);
  if (customId.startsWith("ar:mj:")) return handleMassJoinButton(interaction);
  if (customId.startsWith("ar:sp:")) return handleSpamButton(interaction);
  if (customId.startsWith("ar:al:")) return antiLink.handleAntiLinkButton(interaction);
  if (customId.startsWith("ar:aa:")) return handleAntiAltButton(interaction);
  if (customId.startsWith("ar:dp:") || customId.startsWith("ar:pr:") || customId.startsWith("ar:mv:")) {
    return handleSensitiveToggle(interaction);
  }
  if (customId.startsWith("ar:vs:")) return server.handleVisualButton(interaction);
  if (customId.startsWith("ar:nv:")) return server.handleNativeButton(interaction);
}

async function handleCoreButton(interaction) {
  const guildId = interaction.guild.id;
  const { core } = await getAntiRaidConfig(guildId);

  if (interaction.customId === "ar:core:toggle") {
    await updateAntiRaidConfig(guildId, { "core.enabled": !core.enabled });
  } else if (interaction.customId === "ar:core:mode") {
    await updateAntiRaidConfig(guildId, { "core.mode": core.mode === "live" ? "test" : "live" });
  } else {
    return;
  }
  return showPanel(interaction, "core");
}

// ======================= Selects =======================

async function handleAntiRaidSelect(interaction) {
  if (!canManage(interaction.member)) {
    return deny(interaction, "Só o dono ou quem tem Administrador pode configurar o Anti-Raid.");
  }
  // Menu do hub: escolhe a proteção do grupo e abre o painel dela
  if (interaction.customId.startsWith("ar:pick:")) {
    const key = interaction.values?.[0];
    if (!key || !PANELS[key]) return deny(interaction, "Esse módulo ainda não está disponível.");
    return showPanel(interaction, key);
  }
  if (interaction.customId.startsWith("ar:core:")) return handleCoreSelect(interaction);
  if (interaction.customId.startsWith("ar:mj:")) return handleMassJoinSelect(interaction);
  if (interaction.customId.startsWith("ar:sp:")) return handleSpamSelect(interaction);
  if (interaction.customId.startsWith("ar:al:")) return antiLink.handleAntiLinkSelect(interaction);
  if (interaction.customId.startsWith("ar:ab:")) return handleAntiBotSelect(interaction);
  if (interaction.customId.startsWith("ar:aa:")) return handleAntiAltSelect(interaction);
  if (interaction.customId.startsWith("ar:dp:")) return handleDangerPermsSelect(interaction);
  if (interaction.customId.startsWith("ar:pr:")) return handleProtectedRolesSelect(interaction);
  if (interaction.customId.startsWith("ar:mv:")) return handleMovCallSelect(interaction);
  if (interaction.customId.startsWith("ar:vs:")) return server.handleVisualSelect(interaction);
  if (interaction.customId.startsWith("ar:nv:")) return server.handleNativeSelect(interaction);
}

async function handleCoreSelect(interaction) {
  const guildId = interaction.guild.id;
  const values = interaction.values ?? [];
  let patch = null;

  switch (interaction.customId) {
    case "ar:core:actions":
      patch = { "core.actions": values.filter((v) => v in CORE_ACTIONS) };
      break;
    case "ar:core:limit": {
      const n = Number(values[0]);
      if (CORE_LIMITS.includes(n)) patch = { "core.limit": n };
      break;
    }
    case "ar:core:window": {
      const n = Number(values[0]);
      if (CORE_WINDOWS.includes(n)) patch = { "core.windowSec": n };
      break;
    }
    case "ar:core:punish":
      if (values[0] in PUNISHMENTS) patch = { "core.punishment": values[0] };
      break;
    case "ar:core:alert":
      patch = { "core.alertChannelId": values[0] ?? null };
      break;
    case "ar:core:xusers":
      patch = { "core.exemptUsers": values };
      break;
    case "ar:core:xroles":
      patch = { "core.exemptRoles": values };
      break;
    default:
      return;
  }

  if (patch) await updateAntiRaidConfig(guildId, patch);
  return showPanel(interaction, "core");
}

// ======================= Entrada em massa =======================

async function handleMassJoinButton(interaction) {
  const guildId = interaction.guild.id;
  const { massJoin } = await getAntiRaidConfig(guildId);

  if (interaction.customId === "ar:mj:toggle") {
    await updateAntiRaidConfig(guildId, { "massJoin.enabled": !massJoin.enabled });
  } else if (interaction.customId === "ar:mj:endlock") {
    await endLockdown(interaction.guild, "Encerrado manualmente pelo painel.");
  } else {
    return;
  }
  return showPanel(interaction, "massJoin");
}

async function handleMassJoinSelect(interaction) {
  const guildId = interaction.guild.id;
  const values = interaction.values ?? [];
  let patch = null;

  switch (interaction.customId) {
    case "ar:mj:threshold": {
      const n = pickNum(values, D.MJ_THRESHOLDS);
      if (n) patch = { "massJoin.threshold": n };
      break;
    }
    case "ar:mj:window": {
      const n = pickNum(values, D.MJ_WINDOWS);
      if (n) patch = { "massJoin.windowSec": n };
      break;
    }
    case "ar:mj:signals":
      patch = { "massJoin.signals": pickKeys(values, D.MJ_SIGNALS) };
      break;
    case "ar:mj:minsignals": {
      const n = pickNum(values, [1, 2, 3]);
      if (n) patch = { "massJoin.minSignals": n };
      break;
    }
    case "ar:mj:newdays": {
      const n = pickNum(values, D.MJ_NEWACC_DAYS);
      if (n) patch = { "massJoin.newAccountDays": n };
      break;
    }
    case "ar:mj:level": {
      const key = pickKey(values, D.MJ_LEVELS);
      if (key) patch = { "massJoin.lockdownLevel": key };
      break;
    }
    case "ar:mj:lockmin": {
      const n = pickNum(values, D.MJ_LOCK_MIN);
      if (n) patch = { "massJoin.lockdownMin": n };
      break;
    }
    case "ar:mj:suspect": {
      const key = pickKey(values, D.MJ_SUSPECT_ACTIONS);
      if (key) patch = { "massJoin.suspectAction": key };
      break;
    }
    case "ar:mj:pause": {
      const n = pickNum(values, D.MJ_PAUSE_MIN);
      if (n !== null) patch = { "massJoin.pausedUntil": n === 0 ? 0 : Date.now() + n * 60_000 };
      break;
    }
    case "ar:mj:opts":
      patch = {
        "massJoin.volumeLockdown": values.includes("volume"),
        "massJoin.pauseInvites": values.includes("invites"),
        "massJoin.pauseDms": values.includes("dms"),
      };
      break;
    case "ar:mj:alert":
      patch = { "massJoin.alertChannelId": values[0] ?? null };
      break;
    default:
      return;
  }

  if (patch) await updateAntiRaidConfig(guildId, patch);
  return showPanel(interaction, "massJoin");
}

// ======================= Anti-spam =======================

const SPAM_FLAGS = {
  "ar:sp:toggle": "enabled",
  "ar:sp:staff": "ignoreStaff",
  "ar:sp:signal": "requireSignal",
  "ar:sp:webhooks": "includeWebhooks",
  "ar:sp:delete": "deleteMessages",
};

async function handleSpamButton(interaction) {
  const field = SPAM_FLAGS[interaction.customId];
  if (!field) return;
  const guildId = interaction.guild.id;
  const { spam } = await getAntiRaidConfig(guildId);
  await updateAntiRaidConfig(guildId, { [`spam.${field}`]: !spam[field] });
  // O botão de apagar mensagens fica no painel de resposta; os outros no painel principal
  return showPanel(interaction, interaction.customId === "ar:sp:delete" ? "spamResp" : "spam");
}

async function handleSpamSelect(interaction) {
  const guildId = interaction.guild.id;
  const values = interaction.values ?? [];
  let patch = null;
  let panel = "spam";

  switch (interaction.customId) {
    case "ar:sp:limit": {
      const n = pickNum(values, D.SPAM_LIMITS);
      if (n) patch = { "spam.limit": n };
      break;
    }
    case "ar:sp:window": {
      const n = pickNum(values, D.SPAM_WINDOWS);
      if (n) patch = { "spam.windowSec": n };
      break;
    }
    case "ar:sp:signals":
      patch = { "spam.signals": pickKeys(values, D.SPAM_SIGNALS) };
      break;
    case "ar:sp:mentions": {
      const n = pickNum(values, D.SPAM_MENTIONS);
      if (n) patch = { "spam.mentionLimit": n };
      break;
    }
    // ---- painel de resposta e exceções ----
    case "ar:sp:warnings": {
      panel = "spamResp";
      const n = pickNum(values, D.SPAM_WARNINGS);
      if (n !== null) patch = { "spam.warnings": n };
      break;
    }
    case "ar:sp:warnsec": {
      panel = "spamResp";
      const n = pickNum(values, D.SPAM_WARN_SEC);
      if (n) patch = { "spam.warnSec": n };
      break;
    }
    case "ar:sp:timeout": {
      panel = "spamResp";
      const n = pickNum(values, D.SPAM_TIMEOUT_MIN);
      if (n) patch = { "spam.timeoutMin": n };
      break;
    }
    case "ar:sp:xroles":
      panel = "spamResp";
      patch = { "spam.exemptRoles": values };
      break;
    case "ar:sp:xchannels":
      panel = "spamResp";
      patch = { "spam.exemptChannels": values };
      break;
    case "ar:sp:xusers":
      panel = "spamResp";
      patch = { "spam.exemptUsers": values };
      break;
    case "ar:sp:alert":
      panel = "spamResp";
      patch = { "spam.alertChannelId": values[0] ?? null };
      break;
    default:
      return;
  }

  if (patch) await updateAntiRaidConfig(guildId, patch);
  return showPanel(interaction, panel);
}

// ======================= Anti-bot =======================

async function handleAntiBotSelect(interaction) {
  const guildId = interaction.guild.id;
  const values = interaction.values ?? [];
  let patch = null;

  switch (interaction.customId) {
    case "ar:ab:mode": {
      const key = pickKey(values, D.AB_MODES);
      if (key) patch = { "antiBot.mode": key };
      break;
    }
    case "ar:ab:action": {
      const key = pickKey(values, D.AB_ACTIONS);
      if (key) patch = { "antiBot.action": key };
      break;
    }
    case "ar:ab:inviter": {
      const key = pickKey(values, PUNISHMENTS);
      if (key) patch = { "antiBot.inviterAction": key };
      break;
    }
    case "ar:ab:allowed":
      patch = { "antiBot.allowedBots": values };
      break;
    case "ar:ab:tusers":
      patch = { "antiBot.trustedUsers": values };
      break;
    case "ar:ab:troles":
      patch = { "antiBot.trustedRoles": values };
      break;
    case "ar:ab:alert":
      patch = { "antiBot.alertChannelId": values[0] ?? null };
      break;
    default:
      return;
  }

  if (patch) await updateAntiRaidConfig(guildId, patch);
  return showPanel(interaction, "antiBot");
}

// ======================= Anti-alt =======================

async function handleAntiAltButton(interaction) {
  if (interaction.customId !== "ar:aa:dm") return;
  const guildId = interaction.guild.id;
  const { antiAlt } = await getAntiRaidConfig(guildId);
  await updateAntiRaidConfig(guildId, { "antiAlt.notifyDm": !antiAlt.notifyDm });
  return showPanel(interaction, "antiAlt");
}

async function handleAntiAltSelect(interaction) {
  const guildId = interaction.guild.id;
  const values = interaction.values ?? [];
  let patch = null;

  switch (interaction.customId) {
    case "ar:aa:age": {
      const n = pickNum(values, D.AA_AGES);
      if (n !== null) patch = { "antiAlt.minAgeDays": n };
      break;
    }
    case "ar:aa:response": {
      const key = pickKey(values, D.AA_RESPONSES);
      if (key) patch = { "antiAlt.response": key };
      break;
    }
    case "ar:aa:banmin": {
      const n = pickNum(values, D.AA_BAN_MIN);
      if (n) patch = { "antiAlt.banMin": n };
      break;
    }
    case "ar:aa:xusers":
      patch = { "antiAlt.exemptUsers": values };
      break;
    case "ar:aa:alert":
      patch = { "antiAlt.alertChannelId": values[0] ?? null };
      break;
    default:
      return;
  }

  if (patch) await updateAntiRaidConfig(guildId, patch);
  return showPanel(interaction, "antiAlt");
}

// ======================= Permissões perigosas, Cargos protegidos e Mov call =======================

const SENSITIVE_TOGGLES = {
  "ar:dp:toggle": { key: "dangerPerms" },
  "ar:pr:toggle": { key: "protectedRoles" },
  "ar:mv:toggle": { key: "movCall" },
};

async function handleSensitiveToggle(interaction) {
  const guildId = interaction.guild.id;
  if (interaction.customId === "ar:dp:grants") {
    const { dangerPerms } = await getAntiRaidConfig(guildId);
    await updateAntiRaidConfig(guildId, { "dangerPerms.guardGrants": !dangerPerms.guardGrants });
    return showPanel(interaction, "dangerPerms");
  }
  const target = SENSITIVE_TOGGLES[interaction.customId];
  if (!target) return;
  const cfg = await getAntiRaidConfig(guildId);
  await updateAntiRaidConfig(guildId, { [`${target.key}.enabled`]: !cfg[target.key].enabled });
  return showPanel(interaction, target.key);
}

async function handleDangerPermsSelect(interaction) {
  const values = interaction.values ?? [];
  let patch = null;

  switch (interaction.customId) {
    case "ar:dp:monitored":
      patch = { "dangerPerms.monitored": pickKeys(values, D.DP_PERMS) };
      break;
    case "ar:dp:response": {
      const key = pickKey(values, D.DP_RESPONSES);
      if (key) patch = { "dangerPerms.response": key };
      break;
    }
    case "ar:dp:users":
      patch = { "dangerPerms.authorizedUsers": values };
      break;
    case "ar:dp:roles":
      patch = { "dangerPerms.authorizedRoles": values };
      break;
    case "ar:dp:alert":
      patch = { "dangerPerms.alertChannelId": values[0] ?? null };
      break;
    default:
      return;
  }

  if (patch) await updateAntiRaidConfig(interaction.guild.id, patch);
  return showPanel(interaction, "dangerPerms");
}

async function handleProtectedRolesSelect(interaction) {
  const values = interaction.values ?? [];
  let patch = null;

  switch (interaction.customId) {
    case "ar:pr:roles":
      patch = { "protectedRoles.roles": values };
      break;
    case "ar:pr:punish": {
      const key = pickKey(values, PUNISHMENTS);
      if (key) patch = { "protectedRoles.punishment": key };
      break;
    }
    case "ar:pr:aroles":
      patch = { "protectedRoles.authorizedRoles": values };
      break;
    case "ar:pr:ausers":
      patch = { "protectedRoles.authorizedUsers": values };
      break;
    case "ar:pr:alert":
      patch = { "protectedRoles.alertChannelId": values[0] ?? null };
      break;
    default:
      return;
  }

  if (patch) await updateAntiRaidConfig(interaction.guild.id, patch);
  return showPanel(interaction, "protectedRoles");
}

async function handleMovCallSelect(interaction) {
  const values = interaction.values ?? [];
  let patch = null;

  switch (interaction.customId) {
    case "ar:mv:actions":
      patch = { "movCall.actions": pickKeys(values, D.MV_ACTIONS) };
      break;
    case "ar:mv:limit": {
      const n = pickNum(values, D.MV_LIMITS);
      if (n) patch = { "movCall.limit": n };
      break;
    }
    case "ar:mv:window": {
      const n = pickNum(values, D.MV_WINDOWS);
      if (n) patch = { "movCall.windowSec": n };
      break;
    }
    case "ar:mv:punish": {
      const key = pickKey(values, PUNISHMENTS);
      if (key) patch = { "movCall.punishment": key };
      break;
    }
    case "ar:mv:xusers":
      patch = { "movCall.exemptUsers": values };
      break;
    case "ar:mv:xroles":
      patch = { "movCall.exemptRoles": values };
      break;
    case "ar:mv:alert":
      patch = { "movCall.alertChannelId": values[0] ?? null };
      break;
    default:
      return;
  }

  if (patch) await updateAntiRaidConfig(interaction.guild.id, patch);
  return showPanel(interaction, "movCall");
}

module.exports = { handleAntiRaidButton, handleAntiRaidSelect };
