const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");
const { getNukeConfig, updateNukeConfig, resetNukeConfig, resetNukeMessage } = require("../utils/nuke/store");
const { NEXT_MODE } = require("../utils/nuke/defaults");
const { buildNukeMessage, parseColor, isUrl } = require("../utils/nuke/render");
const { saveNukeThumbnail } = require("../utils/nuke/asset");
const {
  NEXT_ACCESS,
  buildNukeHome,
  buildNukeMessagePanel,
  buildNukeVariables,
  buildNukeRoles,
  buildNukeChannels,
  buildValuesModal,
  buildTextModal,
  buildColorModal,
  buildMediaModal,
} = require("../ui/nukeConfig");

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
    content: "Você não tem permissão para configurar o comando nnuke.",
    flags: EPHEMERAL,
  });
  return false;
}

const deny = (interaction, content) => {
  const payload = { content, flags: EPHEMERAL };
  return interaction.replied || interaction.deferred ? interaction.followUp(payload) : interaction.reply(payload);
};

const homePanel = async (guild) => buildNukeHome(guild, await getNukeConfig(guild.id));
const messagePanel = async (guild) => buildNukeMessagePanel(guild, await getNukeConfig(guild.id));

async function openNukePanel(interaction) {
  if (!(await guard(interaction))) return;
  return interaction.update({ components: await homePanel(interaction.guild) });
}

// Botões que apenas alternam um campo (e voltam para o painel principal)
const TOGGLES = {
  nukecfg_toggle: "enabled",
  nukecfg_log: "sendLog",
  nukecfg_migrate: "migrate",
  nukecfg_pin: "pin",
  nukecfg_ping: "pingExecutor",
};

async function handleNukeConfigButton(interaction) {
  if (!(await guard(interaction))) return;
  const { guild } = interaction;
  const [action, arg] = interaction.customId.split(":");
  const cfg = await getNukeConfig(guild.id);

  if (TOGGLES[action]) {
    await updateNukeConfig(guild.id, { [TOGGLES[action]]: !cfg[TOGGLES[action]] });
    return interaction.update({ components: await homePanel(guild) });
  }

  switch (action) {
    case "nukecfg_home":
      return interaction.update({ components: await homePanel(guild) });

    case "nukecfg_access":
      await updateNukeConfig(guild.id, { access: NEXT_ACCESS[cfg.access] });
      return interaction.update({ components: await homePanel(guild) });

    case "nukecfg_page": {
      if (arg === "msg") return interaction.update({ components: buildNukeMessagePanel(guild, cfg) });
      if (arg === "roles") return interaction.update({ components: buildNukeRoles(guild, cfg) });
      return interaction.update({ components: buildNukeChannels(guild, cfg) });
    }

    case "nukecfg_edit":
      return interaction.showModal(buildValuesModal(cfg));

    case "nukecfg_reset":
      await resetNukeConfig(guild.id);
      return interaction.update({ components: await homePanel(guild) });

    // ----- mensagem -----
    case "nukecfg_mode":
      await updateNukeConfig(guild.id, { mode: NEXT_MODE[cfg.mode] });
      return interaction.update({ components: await messagePanel(guild) });

    case "nukecfg_stamp":
      await updateNukeConfig(guild.id, { embedTimestamp: !cfg.embedTimestamp });
      return interaction.update({ components: await messagePanel(guild) });

    case "nukecfg_text":
      return interaction.showModal(buildTextModal(cfg));

    case "nukecfg_color":
      return interaction.showModal(buildColorModal(cfg));

    case "nukecfg_media":
      return interaction.showModal(buildMediaModal(cfg));

    case "nukecfg_resetmsg":
      await resetNukeMessage(guild.id);
      return interaction.update({ components: await messagePanel(guild) });

    case "nukecfg_vars":
      return interaction.reply({ components: buildNukeVariables(), flags: V2 | EPHEMERAL });

    case "nukecfg_preview": {
      // Mostra, só para quem clicou, como a mensagem vai ficar (com o canal atual como exemplo)
      const payload = await buildNukeMessage(cfg, {
        guild,
        executor: interaction.member,
        channel: interaction.channel,
        oldChannelId: interaction.channelId,
        categoryName: interaction.channel?.parent?.name ?? "Nenhuma",
        now: new Date(),
      });
      return interaction.reply({ ...payload, flags: (payload.flags ?? 0) | EPHEMERAL });
    }

    default:
      return;
  }
}

async function handleNukeConfigSelect(interaction) {
  if (!(await guard(interaction))) return;
  const { guild, customId, values } = interaction;

  // Listas (podem ficar vazias)
  const fields = {
    nukecfg_roles: ["roles", buildNukeRoles],
    nukecfg_blockedroles: ["blockedRoles", buildNukeRoles],
    nukecfg_users: ["users", buildNukeRoles],
    nukecfg_allowedch: ["allowedChannels", buildNukeChannels],
    nukecfg_protectedch: ["protectedChannels", buildNukeChannels],
  };
  const entry = fields[customId];
  if (!entry) return;

  const [field, build] = entry;
  const list = values.filter((id) => id !== guild.id); // nunca o @everyone
  const cfg = await updateNukeConfig(guild.id, { [field]: list });
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

// Lê um campo de texto do modal (campo ausente = undefined, para não mexer no que não foi enviado)
function readText(interaction, id) {
  try {
    return interaction.fields.getTextInputValue(id).trim();
  } catch {
    return undefined;
  }
}

async function finish(interaction, components) {
  if (interaction.isFromMessage()) return interaction.update({ components });
  return interaction.reply({ components, flags: V2 | EPHEMERAL });
}

async function handleNukeConfigModal(interaction) {
  if (!(await guard(interaction))) return;
  const { guild, customId } = interaction;
  const cfg = await getNukeConfig(guild.id);
  const kind = customId.split(":")[1];

  if (kind === "values") {
    const fields = [
      ["cooldown", "cooldown", 0, 3600, "Espera entre usos"],
      ["autoDelete", "autoDeleteSeconds", 0, 3600, "Apagar o aviso"],
    ];
    const patch = {};
    for (const [id, key, min, max, label] of fields) {
      const result = readNumber(interaction, id, cfg[key], min, max, label);
      if (result.error) return deny(interaction, result.error);
      patch[key] = result.value;
    }
    await updateNukeConfig(guild.id, patch);
    return finish(interaction, await homePanel(guild));
  }

  if (kind === "text") {
    const patch = {};
    for (const key of ["containerText", "text", "embedTitle", "embedDescription", "embedFooter"]) {
      const value = readText(interaction, key);
      if (value !== undefined) patch[key] = value;
    }
    await updateNukeConfig(guild.id, patch);
    return finish(interaction, await messagePanel(guild));
  }

  if (kind === "color") {
    const raw = readText(interaction, "color") ?? "";
    let color = "";
    if (raw) {
      const parsed = parseColor(raw);
      if (parsed === null) return deny(interaction, "Cor inválida. Use o formato hexadecimal, por exemplo #5865F2.");
      color = `#${parsed.toString(16).padStart(6, "0").toUpperCase()}`;
    }
    await updateNukeConfig(guild.id, { color });
    return finish(interaction, await messagePanel(guild));
  }

  if (kind === "media") {
    const file = interaction.fields.getUploadedFiles("thumbFile", false)?.first();
    const rawThumb = (readText(interaction, "thumbnail") ?? "").trim();
    const rawImage = (readText(interaction, "image") ?? "").trim();
    const word = rawThumb.toLowerCase();

    let thumbnail;
    if (file) {
      // Imagem enviada: tem prioridade sobre o campo de texto
      const saved = await saveNukeThumbnail(guild.id, file);
      if (saved.error) return deny(interaction, saved.error);
      thumbnail = "upload";
    } else if (!rawThumb || ["nenhuma", "nenhum", "none", "sem"].includes(word)) thumbnail = "none";
    else if (["avatar", "executor", "foto"].includes(word)) thumbnail = "avatar";
    else if (["servidor", "server", "icone", "ícone"].includes(word)) thumbnail = "server";
    else if (isUrl(rawThumb)) thumbnail = rawThumb;
    else return deny(interaction, "Miniatura inválida. Envie uma imagem, ou escreva avatar, servidor, nenhuma ou um link https://.");

    if (rawImage && !isUrl(rawImage)) return deny(interaction, "Imagem inválida. Use um link que comece com https://.");

    await updateNukeConfig(guild.id, { thumbnail, image: rawImage });
    return finish(interaction, await messagePanel(guild));
  }
}

module.exports = { openNukePanel, handleNukeConfigButton, handleNukeConfigSelect, handleNukeConfigModal };
