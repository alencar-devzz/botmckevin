const { MessageFlags, PermissionFlagsBits, TextDisplayBuilder } = require("discord.js");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");
const {
  getSpotifyConfig,
  updateSpotifyConfig,
  resetSpotifyConfig,
  normalizeHex,
  normalizeIcon,
  normalizeEmoji,
} = require("../utils/spotify/store");
const { VISUAL_DEFAULTS, COLOR_FIELDS, SHAPE_FIELDS, THEMES } = require("../utils/spotify/themes");
const { sampleCoverUrl } = require("../utils/spotify/sample");
const { getSpotify } = require("../utils/spotify/activity");
const {
  buildSpotifyHome,
  buildSpotifyUse,
  buildSpotifyLook,
  buildSpotifyColors,
  buildSpotifyShape,
  buildSpotifyTexts,
  buildSpotifyButtons,
  buildSpotifyBehavior,
  MODALS,
  buildFieldsModal,
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
  colors: (guild, cfg) => buildSpotifyColors(cfg),
  shape: (guild, cfg) => buildSpotifyShape(cfg),
  texts: (guild, cfg) => buildSpotifyTexts(cfg),
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
  sptcfg_times: ["showTimes", "shape"],
  sptcfg_knob: ["showKnob", "shape"],
  sptcfg_avatar: ["showAvatar", "texts"],
  sptcfg_infobtn: ["showInfoButton", "buttons"],
  sptcfg_refreshbtn: ["showRefreshButton", "buttons"],
};

// Música de exemplo para a pré-visualização (quando quem configura não está ouvindo nada)
const SAMPLE_TRACK = () => ({
  trackId: "preview",
  title: "Música de exemplo",
  artists: "Artista de exemplo",
  album: "Álbum de exemplo",
  coverUrl: sampleCoverUrl(),
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
    : "-# Pré-visualização com uma música e uma capa de exemplo. Ouça algo no Spotify para ver com a capa real.";
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
      // verde -> capa -> personalizada (só existe se já houver uma cor da barra definida)
      const order = cfg.barHex ? ["green", "cover", "custom"] : ["green", "cover"];
      const next = await updateSpotifyConfig(guild.id, {
        barColor: order[(order.indexOf(cfg.barColor) + 1) % order.length],
      });
      return show("look", next);
    }

    case "sptcfg_name": {
      const order = ["username", "display", "none"];
      const next = await updateSpotifyConfig(guild.id, {
        footerName: order[(order.indexOf(cfg.footerName) + 1) % order.length],
      });
      return show("texts", next);
    }

    case "sptcfg_style": {
      const field = arg === "refresh" ? "refreshStyle" : "infoStyle";
      const order = ["secondary", "primary", "success", "danger"];
      const next = await updateSpotifyConfig(guild.id, { [field]: order[(order.indexOf(cfg[field]) + 1) % order.length] });
      return show("buttons", next);
    }

    case "sptcfg_resetcolors": {
      const patch = Object.fromEntries(COLOR_FIELDS.map((key) => [key, ""]));
      if (cfg.barColor === "custom") patch.barColor = "green";
      return show("colors", await updateSpotifyConfig(guild.id, patch));
    }

    case "sptcfg_resetshape":
      return show(
        "shape",
        await updateSpotifyConfig(guild.id, Object.fromEntries(SHAPE_FIELDS.map((key) => [key, VISUAL_DEFAULTS[key]])))
      );

    case "sptcfg_resettexts":
      return show(
        "texts",
        await updateSpotifyConfig(guild.id, {
          pillText: "",
          pillIcon: "",
          footerText: "",
          footerName: "username",
          showAvatar: true,
          ...Object.fromEntries(MODALS.texts_info.fields.map((f) => [f.id, ""])),
        })
      );

    case "sptcfg_page":
      return PAGES[arg] ? show(arg, cfg) : undefined;

    case "sptcfg_preview":
      return sendPreview(interaction, cfg);

    case "sptcfg_edit":
      if (MODALS[arg]) return interaction.showModal(buildFieldsModal(arg, cfg));
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
  // Tema pronto: troca todo o visual (cores, vidro e formato) de uma vez
  if (customId === "sptcfg_theme") {
    const theme = THEMES[values[0]];
    if (!theme) return;
    const cfg = await updateSpotifyConfig(guild.id, { ...VISUAL_DEFAULTS, ...theme.patch });
    return interaction.update({ components: await page("look", guild, cfg) });
  }

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

  if (MODALS[kind]) {
    const spec = MODALS[kind];
    where = spec.page;
    for (const field of spec.fields) {
      const raw = readText(interaction, field.id);
      if (raw === null) continue; // campo não veio no modal: não mexe

      if (field.type === "hex") {
        const hex = normalizeHex(raw);
        if (hex === null) return deny(interaction, `${field.label}: use um código de cor como #ff5fa2.`);
        patch[field.id] = hex;
      } else if (field.type === "int" || field.type === "intOrEmpty") {
        if (!raw) {
          if (field.type === "intOrEmpty") patch[field.id] = null;
          continue; // vazio mantém o valor atual
        }
        const result = readNumber(interaction, field.id, cfg[field.id], field.min, field.max, field.label);
        if (result.error) return deny(interaction, result.error);
        patch[field.id] = result.value;
      } else if (field.type === "icon") {
        const icon = normalizeIcon(raw);
        if (icon === null) return deny(interaction, `${field.label}: use o ID de um emoji do Discord, <:nome:id> ou um link https.`);
        patch[field.id] = icon;
      } else if (field.type === "emoji") {
        const emoji = normalizeEmoji(raw);
        if (emoji === null) return deny(interaction, `${field.label}: use um emoji comum ou um emoji do servidor no formato <:nome:id>.`);
        patch[field.id] = emoji;
      } else {
        patch[field.id] = raw.slice(0, field.max);
      }
    }

    // A cor da barra definida liga o modo "personalizada"; sem cor, volta ao verde
    if ("barHex" in patch) {
      if (patch.barHex) patch.barColor = "custom";
      else if (cfg.barColor === "custom") patch.barColor = "green";
    }
  } else if (kind === "cooldown") {
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
