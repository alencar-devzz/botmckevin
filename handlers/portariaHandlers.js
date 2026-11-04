const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");
const { getGuildConfig } = require("../database/getGuildConfig");
const { sendGreeting, sendWelcomeDm } = require("../utils/portaria");
const {
  buildPortariaPanel,
  buildGreetingPanel,
  buildDmPanel,
  buildBotRolesPanel,
  buildFilterPanel,
} = require("../ui/portaria");
const {
  MAX_IMAGES,
  buildTextModal,
  buildColorModal,
  buildImagesModalFor,
  buildThumbModal,
  buildDelayModal,
  buildAgeModal,
} = require("../ui/portariaModals");
const { FIELDS, GREETING_KINDS, ALL_KINDS, isUrl } = require("../utils/portariaSettings");
const { COLOR_PRESETS, parseHexColor, parseImageUrls } = require("../utils/ticketSettings");
const { saveUploads, deleteUploads } = require("../utils/ticketMedia");

const EPHEMERAL = MessageFlags.Ephemeral;

const clean = (value) => String(value ?? "").trim();

function selectValues(interaction, id) {
  try {
    return interaction.fields.getStringSelectValues(id) ?? [];
  } catch {
    return [];
  }
}

async function guard(interaction) {
  const member = interaction.member;
  const allowed =
    member?.permissions?.has(PermissionFlagsBits.Administrator) ||
    member?.roles?.cache?.hasAny(...ALL_STAFF_ROLE_IDS);
  if (allowed) return true;

  await interaction.reply({
    content: "Você não tem permissão para configurar a portaria.",
    flags: EPHEMERAL,
  });
  return false;
}

const warn = (interaction, content) =>
  interaction.followUp({ content, flags: EPHEMERAL }).catch(() => {});

// Painel de cada aba, sempre lido do banco na hora
async function panelFor(guild, tab) {
  const config = await getGuildConfig(guild.id);
  if (GREETING_KINDS.includes(tab)) return buildGreetingPanel(guild, config, tab);
  if (tab === "dm") return buildDmPanel(guild, config);
  if (tab === "bots") return buildBotRolesPanel(guild, config);
  if (tab === "filter") return buildFilterPanel(guild, config);
  return buildPortariaPanel(guild, config);
}

// Abre o painel (chamado pelo select "Comunidade")
async function openPortaria(interaction) {
  if (!(await guard(interaction))) return;
  return interaction.update({ components: await panelFor(interaction.guild, "main") });
}

// O bot precisa conseguir ver e enviar mensagens no canal escolhido
function canSend(channel, guild) {
  return channel
    ?.permissionsFor(guild.members.me)
    ?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]);
}

// ---------- botões ----------

async function handlePortariaButton(interaction) {
  if (!(await guard(interaction))) return;
  const [action, key] = interaction.customId.split(":");
  const { guild } = interaction;

  switch (action) {
    case "port_back":
      return interaction.update({ components: await panelFor(guild, "main") });

    case "port_toggle": {
      const config = await getGuildConfig(guild.id);
      if (key === "filter") config.accountFilterEnabled = !config.accountFilterEnabled;
      else if (ALL_KINDS.includes(key)) {
        const f = FIELDS[key].enabled;
        config[f] = !config[f];
      } else return;
      await config.save();
      return interaction.update({ components: await panelFor(guild, key) });
    }

    case "port_style": {
      if (!ALL_KINDS.includes(key)) return;
      const config = await getGuildConfig(guild.id);
      const f = FIELDS[key].style;
      config[f] = config[f] === "container" ? "text" : "container";
      await config.save();
      return interaction.update({ components: await panelFor(guild, key) });
    }

    case "port_clear": {
      if (!GREETING_KINDS.includes(key)) return;
      const config = await getGuildConfig(guild.id);
      config[FIELDS[key].channel] = null;
      await config.save();
      return interaction.update({ components: await panelFor(guild, key) });
    }

    case "port_msg": {
      if (!ALL_KINDS.includes(key)) return;
      const config = await getGuildConfig(guild.id);
      return interaction.showModal(buildTextModal(key, config));
    }

    case "port_color": {
      if (!ALL_KINDS.includes(key)) return;
      const config = await getGuildConfig(guild.id);
      return interaction.showModal(buildColorModal(key, config));
    }

    case "port_img": {
      if (!ALL_KINDS.includes(key)) return;
      const config = await getGuildConfig(guild.id);
      return interaction.showModal(await buildImagesModalFor(key, config));
    }

    case "port_thumb": {
      if (!ALL_KINDS.includes(key)) return;
      const config = await getGuildConfig(guild.id);
      return interaction.showModal(buildThumbModal(key, config));
    }

    case "port_delay": {
      if (!GREETING_KINDS.includes(key)) return;
      const config = await getGuildConfig(guild.id);
      return interaction.showModal(buildDelayModal(key, config[FIELDS[key].delay]));
    }

    case "port_age": {
      const config = await getGuildConfig(guild.id);
      return interaction.showModal(buildAgeModal(config.accountMinAgeDays));
    }

    case "port_test": {
      await interaction.deferUpdate();
      const config = await getGuildConfig(guild.id);
      const member = interaction.member;

      if (key === "dm") {
        const ok = await sendWelcomeDm(member, config, { force: true });
        if (!ok) {
          await warn(
            interaction,
            "Não consegui te enviar a DM. Confira se as suas mensagens diretas estão abertas para membros deste servidor."
          );
        }
        return interaction.editReply({ components: await panelFor(guild, "dm") });
      }

      if (!GREETING_KINDS.includes(key)) return;
      const sent = await sendGreeting(key, member, config, { force: true });
      if (!sent) {
        await warn(
          interaction,
          "Não consegui enviar o teste. Confira se o canal existe e se eu tenho permissão para ver e enviar mensagens nele."
        );
      }
      return interaction.editReply({ components: await panelFor(guild, key) });
    }

    default:
      return;
  }
}

// ---------- selects ----------

async function handlePortariaSelect(interaction) {
  if (!(await guard(interaction))) return;
  const [action, key] = interaction.customId.split(":");
  const { guild } = interaction;

  if (action === "port_menu") {
    const tab = interaction.values[0];
    if (![...GREETING_KINDS, "dm", "bots", "filter"].includes(tab)) return;
    return interaction.update({ components: await panelFor(guild, tab) });
  }

  if (action === "port_channel") {
    if (!GREETING_KINDS.includes(key)) return;
    const channel = guild.channels.cache.get(interaction.values[0]);
    if (!canSend(channel, guild)) {
      return interaction.reply({
        content:
          "Eu não tenho permissão para ver e enviar mensagens nesse canal. Ajuste as permissões e tente de novo.",
        flags: EPHEMERAL,
      });
    }
    const config = await getGuildConfig(guild.id);
    config[FIELDS[key].channel] = channel.id;
    config[FIELDS[key].enabled] = true;
    await config.save();
    return interaction.update({ components: await panelFor(guild, key) });
  }

  if (action === "port_botroles") {
    const config = await getGuildConfig(guild.id);
    config.botAutoRoles = interaction.values;
    await config.save();
    return interaction.update({ components: await panelFor(guild, "bots") });
  }
}

// ---------- modais ----------

async function handleImagesModal(interaction, kind) {
  const { guild } = interaction;
  const f = FIELDS[kind];

  // Baixar os arquivos pode levar alguns segundos
  await interaction.deferUpdate();

  const config = await getGuildConfig(guild.id);
  const current = [...(config[f.images] ?? [])];
  const keepIndexes = new Set(selectValues(interaction, "keep"));
  const kept = current.filter((_, index) => keepIndexes.has(String(index)));
  const removed = current.filter((_, index) => !keepIndexes.has(String(index)));

  // 1) arquivos enviados
  const uploaded = interaction.fields.getUploadedFiles("upload", false);
  const { stored, rejected } = await saveUploads({
    guildId: guild.id,
    panelId: `port-${kind}`,
    scope: "portaria",
    files: uploaded ? [...uploaded.values()] : [],
    existingSources: kept,
    room: Math.max(0, MAX_IMAGES - kept.length),
  });
  const uploadedSources = stored.map((id) => `db:${id}`);

  // 2) links digitados
  const { urls, invalid } = parseImageUrls(interaction.fields.getTextInputValue("links"));
  const fresh = urls.filter((u) => !kept.includes(u));
  const linkRoom = Math.max(0, MAX_IMAGES - kept.length - uploadedSources.length);
  const newLinks = fresh.slice(0, linkRoom);
  const ignoredLinks = invalid + Math.max(0, fresh.length - newLinks.length);

  config[f.images] = [...kept, ...uploadedSources, ...newLinks];
  await config.save();

  await deleteUploads(removed).catch((err) =>
    console.error("[PORTARIA IMAGENS] Erro ao apagar imagens removidas:", err.message)
  );

  await interaction.editReply({ components: await panelFor(guild, kind) });

  const notes = [...rejected];
  if (ignoredLinks) notes.push(`${ignoredLinks} link(s) ignorados (inválidos ou acima do limite).`);
  if (notes.length) await warn(interaction, notes.map((n) => `• ${n}`).join("\n").slice(0, 1900));
}

async function handlePortariaModal(interaction) {
  if (!(await guard(interaction))) return;
  const [, action, key] = interaction.customId.split(":");
  const { guild } = interaction;

  if (action === "img") {
    if (!ALL_KINDS.includes(key)) return;
    return handleImagesModal(interaction, key);
  }

  const config = await getGuildConfig(guild.id);

  if (action === "msg") {
    if (!ALL_KINDS.includes(key)) return;
    const f = FIELDS[key];
    const blank = new Set(selectValues(interaction, "blank"));

    // Preenchido = o texto; vazio + marcado = sem texto de propósito (""); vazio = usa o padrão (null)
    for (const field of ["title", "message", "footer"]) {
      const value = clean(interaction.fields.getTextInputValue(field));
      config[f[field]] = value || (blank.has(field) ? "" : null);
    }
    await config.save();
    return interaction.update({ components: await panelFor(guild, key) });
  }

  if (action === "color") {
    if (!ALL_KINDS.includes(key)) return;
    const hex = clean(interaction.fields.getTextInputValue("hex"));
    let color;
    if (hex) {
      color = parseHexColor(hex);
      if (color == null) {
        return interaction.reply({
          content: "Cor inválida. Use o formato #RRGGBB, por exemplo #ff00aa.",
          flags: EPHEMERAL,
        });
      }
    } else {
      color = COLOR_PRESETS[selectValues(interaction, "preset")[0]]?.value ?? null;
    }
    config[FIELDS[key].color] = color; // null = sem cor
    await config.save();
    return interaction.update({ components: await panelFor(guild, key) });
  }

  if (action === "thumb") {
    if (!ALL_KINDS.includes(key)) return;
    const url = clean(interaction.fields.getTextInputValue("url"));
    if (url && !isUrl(url)) {
      return interaction.reply({
        content: "Link inválido. Use um endereço começando com http:// ou https://.",
        flags: EPHEMERAL,
      });
    }
    const picked = selectValues(interaction, "thumb")[0];
    config[FIELDS[key].thumb] = url || (["avatar", "server", "none"].includes(picked) ? picked : "none");
    await config.save();
    return interaction.update({ components: await panelFor(guild, key) });
  }

  if (action === "delay") {
    if (!GREETING_KINDS.includes(key)) return;
    const seconds = Number.parseInt(interaction.fields.getTextInputValue("seconds"), 10);
    if (Number.isNaN(seconds) || seconds < 0 || seconds > 3600) {
      return interaction.reply({
        content: "Informe um número de segundos entre 0 e 3600.",
        flags: EPHEMERAL,
      });
    }
    config[FIELDS[key].delay] = seconds;
    await config.save();
    return interaction.update({ components: await panelFor(guild, key) });
  }

  if (action === "age") {
    const days = Number.parseInt(interaction.fields.getTextInputValue("days"), 10);
    if (Number.isNaN(days) || days < 1 || days > 365) {
      return interaction.reply({
        content: "Informe uma quantidade de dias entre 1 e 365.",
        flags: EPHEMERAL,
      });
    }
    config.accountMinAgeDays = days;
    await config.save();
    return interaction.update({ components: await panelFor(guild, "filter") });
  }
}

module.exports = {
  openPortaria,
  handlePortariaButton,
  handlePortariaSelect,
  handlePortariaModal,
};
