const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");
const {
  getBumpConfig,
  updateBumpConfig,
  resetBumpMessage,
  resetBumpConfig,
  getBumpState,
} = require("../utils/bump/store");
const { buildBumpMessage, parseColor, isUrl } = require("../utils/bump/render");
const { sendReminder } = require("../utils/bump/engine");
const { DISBOARD_ID } = require("../utils/bump/defaults");
const {
  buildBumpHome,
  buildBumpResetConfirm,
  buildBumpChannels,
  buildBumpMessagePage,
  buildTimingModal,
  buildTextModal,
  buildEmbedModal,
  buildMediaModal,
} = require("../ui/bumpConfig");

const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL = MessageFlags.Ephemeral;

const KINDS = ["reminder", "thanks"];
const TOGGLES = ["enabled", "remind", "thank", "mentionLastBumper", "thanksMention", "deleteOldReminder"];

// Quem configura: Administrador ou cargos da equipe
async function guard(interaction) {
  const member = interaction.member;
  const allowed =
    member?.permissions?.has(PermissionFlagsBits.Administrator) ||
    member?.roles?.cache?.hasAny(...ALL_STAFF_ROLE_IDS);
  if (allowed) return true;

  await interaction.reply({
    content: "Você não tem permissão para configurar o Bump reminder.",
    flags: EPHEMERAL,
  });
  return false;
}

const deny = (interaction, content) => {
  const payload = { content, flags: EPHEMERAL };
  return interaction.replied || interaction.deferred ? interaction.followUp(payload) : interaction.reply(payload);
};

const homePanel = async (guild) =>
  buildBumpHome(guild, await getBumpConfig(guild.id), await getBumpState(guild.id));

async function openBumpPanel(interaction) {
  if (!(await guard(interaction))) return;
  return interaction.update({ components: await homePanel(interaction.guild) });
}

// Mostra o painel atualizado (o modal pode ter vindo de uma mensagem ou não)
async function showPanel(interaction, components) {
  if (interaction.isFromMessage()) return interaction.update({ components });
  return interaction.reply({ components, flags: V2 | EPHEMERAL });
}

// Pré-visualização só para quem clicou (ninguém é marcado de verdade)
async function preview(interaction, kinds) {
  const { guild } = interaction;
  const cfg = await getBumpConfig(guild.id);
  const state = await getBumpState(guild.id);
  const now = new Date();
  const nextAt = new Date(now.getTime() + cfg.intervalMinutes * 60_000);
  const user = { id: interaction.user.id, name: interaction.member?.displayName ?? interaction.user.username };

  const payloads = kinds.map((kind) => {
    const payload = buildBumpMessage(kind, cfg, {
      guild,
      channelId: cfg.channelId,
      now,
      nextAt: kind === "thanks" ? nextAt : now,
      lastBumpAt: state?.lastBumpAt ?? now,
      total: state?.totalBumps ?? 0,
      user,
      pingUser: kind === "reminder" ? cfg.mentionLastBumper : cfg.thanksMention,
      pingRoles: kind === "reminder",
    });
    return { ...payload, allowedMentions: { parse: [] } };
  });

  await interaction.reply({ ...payloads[0], flags: EPHEMERAL });
  for (const payload of payloads.slice(1)) {
    await interaction.followUp({ ...payload, flags: EPHEMERAL });
  }
}

const SEND_ERRORS = {
  no_channel: "Defina o canal do lembrete em \"Canal e cargos\" (ou dê um bump antes, para o bot descobrir o canal).",
  no_access: "Não consigo enviar mensagens no canal do lembrete. Dê ao bot as permissões Ver Canal e Enviar Mensagens.",
  guild: "Não encontrei o servidor.",
  disabled: "O lembrete está desativado.",
};

async function handleBumpButton(interaction) {
  if (!(await guard(interaction))) return;
  const { guild } = interaction;
  const [action, arg] = interaction.customId.split(":");

  switch (action) {
    case "bumpcfg_home":
      return interaction.update({ components: await homePanel(guild) });

    case "bumpcfg_toggle": {
      if (!TOGGLES.includes(arg)) return;
      const cfg = await getBumpConfig(guild.id);
      await updateBumpConfig(guild.id, { [arg]: !cfg[arg] });
      return interaction.update({ components: await homePanel(guild) });
    }

    case "bumpcfg_page": {
      const cfg = await getBumpConfig(guild.id);
      if (arg === "channels") return interaction.update({ components: buildBumpChannels(guild, cfg) });
      if (KINDS.includes(arg)) return interaction.update({ components: buildBumpMessagePage(cfg, arg) });
      return;
    }

    case "bumpcfg_timing":
      return interaction.showModal(buildTimingModal(await getBumpConfig(guild.id)));

    case "bumpcfg_preview":
      return preview(interaction, KINDS.includes(arg) ? [arg] : KINDS);

    case "bumpcfg_send": {
      await interaction.deferReply({ flags: EPHEMERAL });
      const result = await sendReminder(interaction.client, guild.id, { force: true }).catch((err) => {
        console.error("[BUMP] Erro ao enviar o lembrete manual:", err.message);
        return { ok: false, reason: "error" };
      });
      return interaction.editReply(
        result.ok
          ? `Lembrete enviado em <#${result.channelId}>.`
          : SEND_ERRORS[result.reason] ?? "Não consegui enviar o lembrete agora."
      );
    }

    case "bumpcfg_reset":
      return interaction.update({ components: buildBumpResetConfirm() });

    case "bumpcfg_reset_yes":
      await resetBumpConfig(guild.id);
      return interaction.update({ components: await homePanel(guild) });
  }

  // Ações das telas de mensagem: o argumento é o tipo (reminder / thanks)
  if (!KINDS.includes(arg)) return;
  const cfg = await getBumpConfig(guild.id);
  const page = async () => buildBumpMessagePage(await getBumpConfig(guild.id), arg);

  switch (action) {
    case "bumpcfg_mode":
      await updateBumpConfig(guild.id, { [`${arg}.mode`]: cfg[arg].mode === "embed" ? "text" : "embed" });
      return interaction.update({ components: await page() });

    case "bumpcfg_ts":
      await updateBumpConfig(guild.id, { [`${arg}.embedTimestamp`]: !cfg[arg].embedTimestamp });
      return interaction.update({ components: await page() });

    case "bumpcfg_resetmsg":
      await resetBumpMessage(guild.id, arg);
      return interaction.update({ components: await page() });

    case "bumpcfg_text":
      return interaction.showModal(buildTextModal(cfg, arg));

    case "bumpcfg_embed":
      return interaction.showModal(buildEmbedModal(cfg, arg));

    case "bumpcfg_media":
      return interaction.showModal(buildMediaModal(cfg, arg));
  }
}

async function handleBumpSelect(interaction) {
  if (!(await guard(interaction))) return;
  const { guild, customId, values } = interaction;

  if (customId === "bumpcfg_channel") {
    const cfg = await updateBumpConfig(guild.id, { channelId: values[0] ?? "" });
    return interaction.update({ components: buildBumpChannels(guild, cfg) });
  }

  if (customId === "bumpcfg_roles") {
    const list = values.filter((id) => id !== guild.id); // nunca o @everyone
    const cfg = await updateBumpConfig(guild.id, { mentionRoles: list });
    return interaction.update({ components: buildBumpChannels(guild, cfg) });
  }
}

const field = (interaction, id) => {
  try {
    return interaction.fields.getTextInputValue(id).trim();
  } catch {
    return null; // campo não veio no modal
  }
};

function readNumber(interaction, id, current, min, max, label) {
  const raw = field(interaction, id);
  if (!raw) return { value: current };
  if (!/^\d+$/.test(raw)) return { error: `${label}: use apenas números inteiros.` };
  const n = Number(raw);
  if (n < min || n > max) return { error: `${label}: use um valor entre ${min} e ${max}.` };
  return { value: n };
}

// Campos de link: vazio limpa, texto que não é link https:// cancela com aviso
function readUrls(interaction, map) {
  const patch = {};
  for (const [id, [key, label]] of Object.entries(map)) {
    const raw = field(interaction, id);
    if (raw === null) continue;
    if (raw && !isUrl(raw)) return { error: `${label}: use um link começando com http:// ou https://.` };
    patch[key] = raw;
  }
  return { patch };
}

async function handleBumpModal(interaction) {
  if (!(await guard(interaction))) return;
  const { guild } = interaction;
  const [, name, kind] = interaction.customId.split(":");
  const cfg = await getBumpConfig(guild.id);

  if (name === "timing") {
    const interval = readNumber(interaction, "interval", cfg.intervalMinutes, 1, 10080, "Tempo entre bumps");
    if (interval.error) return deny(interaction, interval.error);
    const repeat = readNumber(interaction, "repeat", cfg.repeatMinutes, 0, 1440, "Repetir lembrete");
    if (repeat.error) return deny(interaction, repeat.error);

    const botId = field(interaction, "botId") || DISBOARD_ID;
    if (!/^\d{15,25}$/.test(botId)) return deny(interaction, "ID do bot: cole o ID numérico do bot de bump.");

    const command = (field(interaction, "command") || "bump").replace(/^\/+/, "").toLowerCase();
    const keywords = (field(interaction, "keywords") ?? "")
      .split(/[,\n]/)
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 20);

    await updateBumpConfig(guild.id, {
      intervalMinutes: interval.value,
      repeatMinutes: repeat.value,
      bumpBotId: botId,
      commandName: command,
      successKeywords: keywords,
    });
    return showPanel(interaction, await homePanel(guild));
  }

  if (!KINDS.includes(kind)) return;

  if (name === "text") {
    const value = field(interaction, "text") ?? "";
    await updateBumpConfig(guild.id, { [`${kind}.text`]: value });
  } else if (name === "embed") {
    const color = field(interaction, "color");
    if (color && parseColor(color) === null) {
      return deny(interaction, "Cor: use um código hex, por exemplo #5865F2.");
    }
    await updateBumpConfig(guild.id, {
      [`${kind}.embedTitle`]: field(interaction, "title") ?? "",
      [`${kind}.embedDescription`]: field(interaction, "description") ?? "",
      [`${kind}.embedColor`]: color ? `#${color.replace("#", "").toUpperCase()}` : "#5865F2",
      [`${kind}.embedAuthor`]: field(interaction, "author") ?? "",
      [`${kind}.embedFooter`]: field(interaction, "footer") ?? "",
    });
  } else if (name === "media") {
    const { patch, error } = readUrls(interaction, {
      image: ["embedImage", "Imagem grande"],
      thumbnail: ["embedThumbnail", "Miniatura"],
      url: ["embedUrl", "Link do título"],
      authorIcon: ["embedAuthorIcon", "Ícone do autor"],
      footerIcon: ["embedFooterIcon", "Ícone do rodapé"],
    });
    if (error) return deny(interaction, error);
    await updateBumpConfig(
      guild.id,
      Object.fromEntries(Object.entries(patch).map(([k, v]) => [`${kind}.${k}`, v]))
    );
  } else {
    return;
  }

  return showPanel(interaction, buildBumpMessagePage(await getBumpConfig(guild.id), kind));
}

module.exports = { openBumpPanel, handleBumpButton, handleBumpSelect, handleBumpModal };
