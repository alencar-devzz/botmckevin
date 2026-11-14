const { MessageFlags, PermissionFlagsBits, TextDisplayBuilder } = require("discord.js");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");
const { getSpotifyConfig, updateSpotifyConfig, resetSpotifyConfig } = require("../utils/spotify/store");
const { getSpotify } = require("../utils/spotify/activity");
const {
  buildSpotifyHome,
  buildSpotifyUse,
  buildSpotifyLook,
  buildSpotifyButtons,
  buildSpotifyBehavior,
  buildCooldownModal,
  buildLabelsModal,
  buildBehaviorModal,
} = require("../ui/spotifyConfig");
const { buildCardPayload } = require("./spotifyHandlers");

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
    content: "Você não tem permissão para configurar o comando spotify.",
    flags: EPHEMERAL,
  });
  return false;
}

const deny = (interaction, content) => {
  const payload = { content, flags: EPHEMERAL };
  return interaction.replied || interaction.deferred ? interaction.followUp(payload) : interaction.reply(payload);
};

// Cada tela do painel (home, use, look, buttons, behavior)
const PAGES = {
  home: (guild, cfg) => buildSpotifyHome(guild, cfg),
  use: (guild, cfg) => buildSpotifyUse(guild, cfg),
  look: (guild, cfg) => buildSpotifyLook(cfg),
  buttons: (guild, cfg) => buildSpotifyButtons(cfg),
  behavior: (guild, cfg) => buildSpotifyBehavior(cfg),
};
const page = async (name, guild, cfg) => PAGES[name](guild, cfg ?? (await getSpotifyConfig(guild.id)));

async function openSpotifyPanel(interaction) {
  if (!(await guard(interaction))) return;
  return interaction.update({ components: await page("home", interaction.guild) });
}

// Botões que apenas alternam um campo: [campo, tela onde o botão está]
const TOGGLES = {
  sptcfg_toggle: ["enabled", "home"],
  sptcfg_others: ["allowOthers", "home"],
  sptcfg_nowplaying: ["showNowPlaying", "look"],
  sptcfg_pill: ["showPill", "look"],
  sptcfg_infobtn: ["showInfoButton", "buttons"],
  sptcfg_refreshbtn: ["showRefreshButton", "buttons"],
};

// Música de exemplo para a pré-visualização (quando quem configura não está ouvindo nada)
const SAMPLE_TRACK = () => ({
  trackId: "preview",
  title: "Música de exemplo",
  artists: "Artista de exemplo",
  album: "Álbum de exemplo",
  coverUrl: null,
  startMs: Date.now() - 83_000,
  durationMs: 215_000,
});

async function sendPreview(interaction, cfg) {
  await interaction.deferReply({ flags: EPHEMERAL });

  const real = getSpotify(interaction.guild, interaction.user.id);
  const track = real ?? SAMPLE_TRACK();
  const { components, files } = await buildCardPayload({
    track,
    member: interaction.member,
    userId: interaction.user.id,
    cfg,
    preview: true,
  });

  const note = real
    ? "-# Pré-visualização com a música que você está ouvindo agora. Os botões ficam desligados aqui."
    : "-# Pré-visualização com uma música de exemplo (sem capa, então a barra \"da capa\" aparece verde). Ouça algo no Spotify para ver com a capa real.";
  return interaction.editReply({
    components: [new TextDisplayBuilder().setContent(note), ...components],
    files,
    flags: V2,
    allowedMentions: { parse: [] },
  });
}

async function handleSpotifyConfigButton(interaction) {
  if (!(await guard(interaction))) return;
  const { guild } = interaction;
  const [action, arg] = interaction.customId.split(":");
  const cfg = await getSpotifyConfig(guild.id);
  const show = async (name, next) => interaction.update({ components: await page(name, guild, next) });

  if (TOGGLES[action]) {
    const [field, where] = TOGGLES[action];
    const next = await updateSpotifyConfig(guild.id, { [field]: !cfg[field] });
    return show(arg === "use" ? "use" : where, next);
  }

  switch (action) {
    case "sptcfg_home":
      return show("home", cfg);

    case "sptcfg_access": {
      const next = await updateSpotifyConfig(guild.id, { access: cfg.access === "roles" ? "everyone" : "roles" });
      return show(arg === "use" ? "use" : "home", next);
    }

    case "sptcfg_bar": {
      const next = await updateSpotifyConfig(guild.id, { barColor: cfg.barColor === "cover" ? "green" : "cover" });
      return show("look", next);
    }

    case "sptcfg_page":
      return PAGES[arg] ? show(arg, cfg) : undefined;

    case "sptcfg_preview":
      return sendPreview(interaction, cfg);

    case "sptcfg_edit":
      if (arg === "cooldown") return interaction.showModal(buildCooldownModal(cfg));
      if (arg === "labels") return interaction.showModal(buildLabelsModal(cfg));
      if (arg === "behavior") return interaction.showModal(buildBehaviorModal(cfg));
      return;

    case "sptcfg_resetmsg": {
      const next = await updateSpotifyConfig(guild.id, { notListeningMessage: "" });
      return show("behavior", next);
    }

    case "sptcfg_reset": {
      const next = await resetSpotifyConfig(guild.id);
      return show("home", next);
    }

    default:
      return;
  }
}

async function handleSpotifyConfigSelect(interaction) {
  if (!(await guard(interaction))) return;
  const { guild, customId, values } = interaction;

  // [campo, tela, valores válidos (para menus de texto) ou null (cargos/canais, podem ficar vazios)]
  const fields = {
    sptcfg_allowedch: ["allowedChannels", "use", null],
    sptcfg_roles: ["roles", "use", null],
    sptcfg_glass: ["glass", "look", ["dark", "normal", "light"]],
    sptcfg_lyrics: ["lyricsSource", "buttons", ["lrclib", "vagalume", "off"]],
  };
  const entry = fields[customId];
  if (!entry) return;

  const [field, where, valid] = entry;
  const value = valid ? values[0] : values.filter((id) => id !== guild.id); // nunca o @everyone
  if (valid && !valid.includes(value)) return;

  const cfg = await updateSpotifyConfig(guild.id, { [field]: value });
  return interaction.update({ components: await page(where, guild, cfg) });
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

const readText = (interaction, id) => {
  try {
    return interaction.fields.getTextInputValue(id).trim();
  } catch {
    return null; // campo não veio no modal: não mexe
  }
};

async function handleSpotifyConfigModal(interaction) {
  if (!(await guard(interaction))) return;
  const { guild } = interaction;
  const kind = interaction.customId.split(":")[1];
  const cfg = await getSpotifyConfig(guild.id);

  const patch = {};
  let where = "home";

  if (kind === "cooldown") {
    where = "use";
    const result = readNumber(interaction, "cooldown", cfg.cooldown, 0, 3600, "Espera entre usos");
    if (result.error) return deny(interaction, result.error);
    patch.cooldown = result.value;
  } else if (kind === "labels") {
    where = "buttons";
    for (const id of ["linkLabel", "infoLabel", "refreshLabel"]) {
      const value = readText(interaction, id);
      if (value !== null) patch[id] = value; // vazio volta ao padrão (o store cuida disso)
    }
  } else if (kind === "behavior") {
    where = "behavior";
    const result = readNumber(interaction, "autoDeleteMinutes", cfg.autoDeleteMinutes, 0, 1440, "Apagar o card após");
    if (result.error) return deny(interaction, result.error);
    patch.autoDeleteMinutes = result.value;
    const message = readText(interaction, "notListeningMessage");
    if (message !== null) patch.notListeningMessage = message.slice(0, 300);
  } else {
    return;
  }

  const next = await updateSpotifyConfig(guild.id, patch);
  const components = await page(where, guild, next);
  if (interaction.isFromMessage()) return interaction.update({ components });
  return interaction.reply({ components, flags: V2 | EPHEMERAL });
}

module.exports = {
  openSpotifyPanel,
  handleSpotifyConfigButton,
  handleSpotifyConfigSelect,
  handleSpotifyConfigModal,
};
