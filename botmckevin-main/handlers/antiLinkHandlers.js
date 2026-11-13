const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { getAntiRaidConfig, updateAntiRaidConfig } = require("../utils/antiraid/store");
const D = require("../utils/antiraid/defaults");
const { parseDomainList, parseWrappers, extractLinks } = require("../utils/antiraid/linkTools");
const { buildNotice } = require("../ui/antiraid");
const {
  buildAntiLinkPanel,
  buildAntiLinkResponsePanel,
  buildDomainModal,
  buildGuildsModal,
  buildWrapModal,
  buildMessageModal,
} = require("../ui/antiraidLink");

// Anti-link (ar:al:*): botões, selects e modais das listas.

const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL = MessageFlags.Ephemeral;

const PANELS = {
  antiLink: buildAntiLinkPanel,
  antiLinkResp: buildAntiLinkResponsePanel,
};

const pickNum = (values, list) => {
  const n = Number(values?.[0]);
  return list.includes(n) ? n : null;
};
const pickKey = (values, map) => (values?.[0] in map ? values[0] : null);
const pickKeys = (values, map) => (values ?? []).filter((v) => v in map);

const canManage = (member) =>
  member?.guild?.ownerId === member?.id || member?.permissions.has(PermissionFlagsBits.Administrator);

async function deny(interaction, content) {
  const payload = { components: buildNotice(content), flags: V2 | EPHEMERAL };
  if (interaction.deferred || interaction.replied) return interaction.followUp(payload).catch(() => {});
  return interaction.reply(payload).catch(() => {});
}

const DENIED = "Só o dono ou quem tem Administrador pode configurar o Anti-Raid.";

async function panelFor(interaction, key) {
  const cfg = await getAntiRaidConfig(interaction.guild.id);
  return PANELS[key](interaction.guild, cfg);
}

async function show(interaction, key) {
  return interaction.update({ components: await panelFor(interaction, key) });
}

// ======================= Botões =======================

// botão -> [campo, painel que reabre]
const FLAGS = {
  "ar:al:toggle": ["enabled", "antiLink"],
  "ar:al:own": ["allowOwnInvites", "antiLink"],
  "ar:al:bare": ["bareDomains", "antiLink"],
  "ar:al:notify": ["notify", "antiLinkResp"],
  "ar:al:log": ["logEnabled", "antiLinkResp"],
  "ar:al:staff": ["ignoreStaff", "antiLinkResp"],
};

async function handleAntiLinkButton(interaction) {
  if (!canManage(interaction.member)) return deny(interaction, DENIED);

  const { customId, guild } = interaction;
  const flag = FLAGS[customId];
  if (flag) {
    const { antiLink } = await getAntiRaidConfig(guild.id);
    await updateAntiRaidConfig(guild.id, { [`antiLink.${flag[0]}`]: !antiLink[flag[0]] });
    return show(interaction, flag[1]);
  }

  // Os modais abrem direto: a resposta precisa vir antes de qualquer consulta demorada
  const { antiLink } = await getAntiRaidConfig(guild.id);
  switch (customId) {
    case "ar:al:domAllow":
      return interaction.showModal(buildDomainModal("allow", antiLink.allowedDomains));
    case "ar:al:domBlock":
      return interaction.showModal(buildDomainModal("block", antiLink.blockedDomains));
    case "ar:al:wrap":
      return interaction.showModal(buildWrapModal(antiLink.wrappers));
    case "ar:al:guilds":
      return interaction.showModal(buildGuildsModal(antiLink.allowedGuilds));
    case "ar:al:msg":
      return interaction.showModal(buildMessageModal(antiLink.message));
    default:
      return;
  }
}

// ======================= Selects =======================

async function handleAntiLinkSelect(interaction) {
  if (!canManage(interaction.member)) return deny(interaction, DENIED);

  const values = interaction.values ?? [];
  let patch = null;
  let panel = "antiLink";

  switch (interaction.customId) {
    case "ar:al:mode": {
      const key = pickKey(values, D.AL_MODES);
      if (key) patch = { "antiLink.mode": key };
      break;
    }
    case "ar:al:types":
      patch = { "antiLink.blockTypes": pickKeys(values, D.AL_TYPES) };
      break;
    case "ar:al:allowtypes":
      patch = { "antiLink.allowedTypes": pickKeys(values, D.AL_TYPES) };
      break;

    // ---- painel de resposta e exceções ----
    case "ar:al:punish": {
      panel = "antiLinkResp";
      const key = pickKey(values, D.AL_PUNISH);
      if (key) patch = { "antiLink.punishment": key };
      break;
    }
    case "ar:al:strikes": {
      panel = "antiLinkResp";
      const n = pickNum(values, D.AL_STRIKES);
      if (n) patch = { "antiLink.strikeLimit": n };
      break;
    }
    case "ar:al:window": {
      panel = "antiLinkResp";
      const n = pickNum(values, D.AL_STRIKE_WINDOW);
      if (n) patch = { "antiLink.strikeWindowMin": n };
      break;
    }
    case "ar:al:timeout": {
      panel = "antiLinkResp";
      const n = pickNum(values, D.AL_TIMEOUT_MIN);
      if (n) patch = { "antiLink.timeoutMin": n };
      break;
    }
    case "ar:al:xroles":
      panel = "antiLinkResp";
      patch = { "antiLink.exemptRoles": values };
      break;
    case "ar:al:xchannels":
      panel = "antiLinkResp";
      patch = { "antiLink.exemptChannels": values };
      break;
    case "ar:al:xusers":
      panel = "antiLinkResp";
      patch = { "antiLink.exemptUsers": values };
      break;
    case "ar:al:alert":
      panel = "antiLinkResp";
      patch = { "antiLink.alertChannelId": values[0] ?? null };
      break;
    default:
      return;
  }

  if (patch) await updateAntiRaidConfig(interaction.guild.id, patch);
  return show(interaction, panel);
}

// ======================= Modais =======================

// Troca o painel que originou o modal pelo atualizado
async function redraw(interaction, key) {
  const components = await panelFor(interaction, key);
  if (interaction.deferred) return interaction.editReply({ components }).catch(() => {});
  if (interaction.isFromMessage()) return interaction.update({ components });
  return interaction.reply({ components, flags: V2 | EPHEMERAL });
}

const SNOWFLAKE = /^\d{17,20}$/;

// Lê "ID", "ID # nome", convite ou código, um por linha; consulta o Discord para convites
async function parseGuilds(interaction, input, previous) {
  const known = new Map(previous.map((g) => [g.id, g.name]));
  const result = new Map();
  const invalid = [];

  const tokens = String(input ?? "")
    .split(/\r?\n/)
    .map((line) => line.split("#")[0])
    .flatMap((line) => line.split(/[\s,;]+/))
    .filter(Boolean);

  for (const token of tokens.slice(0, D.AL_MAX_GUILDS * 2)) {
    if (result.size >= D.AL_MAX_GUILDS) break;

    if (SNOWFLAKE.test(token)) {
      const name = known.get(token) ?? interaction.client.guilds.cache.get(token)?.name ?? null;
      result.set(token, { id: token, name });
      continue;
    }

    const code = extractLinks(token)[0]?.code ?? (/^[A-Za-z0-9-]{2,32}$/.test(token) ? token : null);
    const invite = code ? await interaction.client.fetchInvite(code).catch(() => null) : null;
    if (invite?.guild) result.set(invite.guild.id, { id: invite.guild.id, name: invite.guild.name ?? null });
    else invalid.push(token.slice(0, 40));
  }
  return { list: [...result.values()], invalid };
}

async function handleAntiLinkModal(interaction) {
  if (!canManage(interaction.member)) return deny(interaction, DENIED);

  const { customId, guild } = interaction;
  const kind = customId.slice("ar:al:modal:".length);
  const raw = interaction.fields.getTextInputValue(kind === "msg" ? "message" : "list") ?? "";
  const notes = [];

  if (kind === "allow" || kind === "block") {
    const { list, invalid, truncated } = parseDomainList(raw, { max: D.AL_MAX_DOMAINS });
    await updateAntiRaidConfig(guild.id, { [`antiLink.${kind === "allow" ? "allowedDomains" : "blockedDomains"}`]: list });
    if (invalid.length) notes.push(`Ignorei o que não parece domínio: ${invalid.map((v) => `\`${v}\``).join(", ")}.`);
    if (truncated) notes.push(`O limite é de ${D.AL_MAX_DOMAINS} domínios; o excedente ficou de fora.`);
    await redraw(interaction, "antiLink");
  } else if (kind === "guilds") {
    // consultar convites no Discord pode passar de 3s
    await interaction.deferUpdate();
    const { antiLink } = await getAntiRaidConfig(guild.id);
    const { list, invalid } = await parseGuilds(interaction, raw, antiLink.allowedGuilds);
    await updateAntiRaidConfig(guild.id, { "antiLink.allowedGuilds": list });
    if (invalid.length) {
      notes.push(`Não consegui identificar o servidor de: ${invalid.map((v) => `\`${v}\``).join(", ")}. Use o ID ou um convite que ainda funcione.`);
    }
    await redraw(interaction, "antiLink");
  } else if (kind === "wrap") {
    const { list, invalid, truncated } = parseWrappers(raw, D.AL_MAX_WRAPPERS);
    await updateAntiRaidConfig(guild.id, { "antiLink.wrappers": list });
    if (invalid.length) notes.push(`Ignorei o que não é um par de símbolos: ${invalid.map((v) => `\`${v}\``).join(", ")}. Use algo como \`< >\` ou \`[ ]\`.`);
    if (truncated) notes.push(`O limite é de ${D.AL_MAX_WRAPPERS} pares; o excedente ficou de fora.`);
    await redraw(interaction, "antiLink");
  } else if (kind === "msg") {
    const message = raw.trim() || D.DEFAULTS.antiLink.message;
    await updateAntiRaidConfig(guild.id, { "antiLink.message": message });
    await redraw(interaction, "antiLinkResp");
  } else {
    return;
  }

  if (notes.length) {
    await interaction.followUp({ components: buildNotice(notes.join("\n")), flags: V2 | EPHEMERAL }).catch(() => {});
  }
}

module.exports = { PANELS, handleAntiLinkButton, handleAntiLinkSelect, handleAntiLinkModal };
