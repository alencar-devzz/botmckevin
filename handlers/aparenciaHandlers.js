const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");
const { getPrefix } = require("../utils/getPrefix");
const { getGuildConfig } = require("../database/getGuildConfig");
const BotConfig = require("../database/models/BotConfig");
const {
  ACTIVITY_TYPES,
  PRESENCE_STATUS,
  STREAM_URL,
  getBotConfig,
  saveBotConfig,
  applyPresence,
  describePresence,
} = require("../utils/botPresence");
const {
  buildAparenciaPanel,
  buildAvatarBannerPanel,
  buildPrefixoPanel,
  buildNomePanel,
  buildStatusPanel,
  buildStatusConfigPanel,
} = require("../ui/aparencia");
const {
  buildImageModal,
  buildPrefixoModal,
  buildNomeModal,
  buildStatusTipoModal,
  buildStatusTextoModal,
} = require("../ui/aparenciaModals");

const EPHEMERAL = MessageFlags.Ephemeral;

// Só administradores e a equipe podem mexer na aparência do bot
async function guard(interaction) {
  const member = interaction.member;
  const allowed =
    member?.permissions?.has(PermissionFlagsBits.Administrator) ||
    member?.roles?.cache?.hasAny(...ALL_STAFF_ROLE_IDS);
  if (allowed) return true;

  await interaction.reply({
    content: "Você não tem permissão para configurar a aparência do bot.",
    flags: EPHEMERAL,
  });
  return false;
}

const warn = (interaction, content) =>
  interaction.followUp({ content, flags: EPHEMERAL }).catch(() => {});

// ---------- estados (sempre lidos na hora, então os painéis se atualizam sozinhos) ----------

async function imageState(client) {
  await client.user.fetch().catch(() => {}); // o banner só vem nesse fetch
  return { hasAvatar: Boolean(client.user.avatar), hasBanner: Boolean(client.user.banner) };
}

async function summaryState(interaction) {
  return {
    prefix: await getPrefix(interaction.guild.id),
    name: interaction.client.user.username,
    statusText: describePresence(interaction.client),
  };
}

async function statusView(client) {
  const cfg = await getBotConfig();
  if (cfg.presenceActivity && cfg.presenceActivity !== "none") {
    return buildStatusConfigPanel({ cfg });
  }
  return buildStatusPanel({ statusText: describePresence(client) });
}

// Chamado pelo menu principal (select "Aparência e prefixo")
async function openAparencia(interaction) {
  if (!(await guard(interaction))) return;
  return interaction.reply({
    components: buildAparenciaPanel(await summaryState(interaction)),
    flags: MessageFlags.IsComponentsV2 | EPHEMERAL,
  });
}

// ---------- botões ----------

async function handleAparenciaButton(interaction) {
  if (!(await guard(interaction))) return;
  const [action, arg] = interaction.customId.split(":");
  const { client } = interaction;

  switch (action) {
    case "apar_back":
      return interaction.update({ components: buildAparenciaPanel(await summaryState(interaction)) });

    case "apar_open": {
      if (arg === "avatar") {
        return interaction.update({ components: buildAvatarBannerPanel(await imageState(client)) });
      }
      if (arg === "prefixo") {
        const prefix = await getPrefix(interaction.guild.id);
        return interaction.update({ components: buildPrefixoPanel({ prefix }) });
      }
      if (arg === "nome") {
        return interaction.update({ components: buildNomePanel({ name: client.user.username }) });
      }
      if (arg === "status") {
        return interaction.update({
          components: buildStatusPanel({ statusText: describePresence(client) }),
        });
      }
      return;
    }

    // ----- avatar / banner -----
    case "apar_avatar_set":
      return interaction.showModal(buildImageModal("avatar"));
    case "apar_banner_set":
      return interaction.showModal(buildImageModal("banner"));

    case "apar_avatar_del":
    case "apar_banner_del": {
      const kind = action === "apar_avatar_del" ? "avatar" : "banner";
      await interaction.deferUpdate();
      try {
        if (kind === "avatar") await client.user.setAvatar(null);
        else await client.user.setBanner(null);
        await saveBotConfig({ [kind]: null });
      } catch (err) {
        console.error(`[APARENCIA] Erro ao remover ${kind}:`, err);
        await warn(interaction, `Não consegui remover o ${kind} agora. Tente novamente em instantes.`);
      }
      return interaction.editReply({ components: buildAvatarBannerPanel(await imageState(client)) });
    }

    // ----- prefixo / nome -----
    case "apar_prefixo_set": {
      const prefix = await getPrefix(interaction.guild.id);
      return interaction.showModal(buildPrefixoModal(prefix));
    }

    case "apar_nome_set":
      return interaction.showModal(buildNomeModal(client.user.username));

    // ----- status -----
    case "apar_status_cfg": {
      const cfg = await getBotConfig();
      return interaction.showModal(buildStatusTipoModal(cfg.presenceActivity));
    }

    case "apar_status_text": {
      const cfg = await getBotConfig();
      if (!ACTIVITY_TYPES[cfg.presenceActivity]) {
        return interaction.reply({ content: "Escolha um tipo de status primeiro.", flags: EPHEMERAL });
      }
      return interaction.showModal(buildStatusTextoModal(cfg));
    }

    case "apar_status_clear": {
      const cfg = await saveBotConfig({
        presenceActivity: "none",
        presenceName: null,
        presenceState: null,
        presenceUrl: null,
      });
      await applyPresence(client, cfg);
      return interaction.update({ components: await statusView(client) });
    }

    default:
      return;
  }
}

// ---------- selects ----------

async function handleAparenciaSelect(interaction) {
  if (!(await guard(interaction))) return;

  if (interaction.customId === "apar_status_presenca") {
    const value = interaction.values[0];
    if (!PRESENCE_STATUS[value]) return;
    const cfg = await saveBotConfig({ presenceStatus: value });
    await applyPresence(interaction.client, cfg);
    return interaction.update({ components: await statusView(interaction.client) });
  }
}

// ---------- modais ----------

// Avatar / banner: aceita upload ou link
async function handleImageModal(interaction, kind) {
  await interaction.deferUpdate(); // baixar e enviar a imagem pode demorar
  const { client } = interaction;

  const file = interaction.fields.getUploadedFiles("file", false)?.first();
  const link = interaction.fields.getTextInputValue("link").trim();

  let source = null;
  if (file) {
    if (file.contentType && !file.contentType.startsWith("image/")) {
      return warn(interaction, "Envie um arquivo de imagem válido (png, jpg, gif ou webp).");
    }
    source = file.url;
  } else if (link) {
    if (!/^https?:\/\/\S+$/i.test(link)) {
      return warn(interaction, "Link inválido. Use um link que começa com http:// ou https://");
    }
    source = link;
  } else {
    return warn(interaction, "Envie uma imagem ou informe o link de uma imagem.");
  }

  try {
    if (kind === "avatar") await client.user.setAvatar(source);
    else await client.user.setBanner(source);
    await saveBotConfig({ [kind]: source });
  } catch (err) {
    console.error(`[APARENCIA] Erro ao definir ${kind}:`, err);
    await warn(
      interaction,
      "Não consegui definir essa imagem (o Discord limita trocas frequentes ou a imagem não é aceita). Tente outra."
    );
  }

  return interaction.editReply({ components: buildAvatarBannerPanel(await imageState(client)) });
}

async function handleAparenciaModal(interaction) {
  if (!(await guard(interaction))) return;
  const { customId, client } = interaction;
  const field = (id) => interaction.fields.getTextInputValue(id).trim();

  switch (customId) {
    case "apar_modal_avatar":
      return handleImageModal(interaction, "avatar");

    case "apar_modal_banner":
      return handleImageModal(interaction, "banner");

    case "apar_modal_prefixo": {
      const prefix = field("prefixo");
      if (!prefix || /\s/.test(prefix)) {
        return interaction.reply({
          content: "O prefixo não pode ficar vazio nem ter espaços.",
          flags: EPHEMERAL,
        });
      }
      const config = await getGuildConfig(interaction.guild.id);
      config.prefix = prefix;
      await config.save();
      return interaction.update({ components: buildPrefixoPanel({ prefix }) });
    }

    case "apar_modal_nome": {
      const name = field("nome");
      if (name.length < 2) {
        return interaction.reply({
          content: "O nome precisa ter pelo menos 2 caracteres.",
          flags: EPHEMERAL,
        });
      }
      await interaction.deferUpdate();
      try {
        await client.user.setUsername(name);
        await BotConfig.findByIdAndUpdate("global", { $set: { name } }, { upsert: true });
      } catch (err) {
        console.error("[APARENCIA] Erro ao definir nome:", err);
        await warn(
          interaction,
          "Não foi possível alterar o nome agora (o Discord limita trocas de nome com frequência)."
        );
      }
      return interaction.editReply({ components: buildNomePanel({ name: client.user.username }) });
    }

    case "apar_modal_status_tipo": {
      const kind = interaction.fields.getStringSelectValues("tipo")[0];
      if (kind !== "none" && !ACTIVITY_TYPES[kind]) return;

      const patch = { presenceActivity: kind };
      if (kind === "none") Object.assign(patch, { presenceName: null, presenceState: null, presenceUrl: null });

      const cfg = await saveBotConfig(patch);
      await applyPresence(client, cfg);
      return interaction.update({ components: await statusView(client) });
    }

    case "apar_modal_status_texto": {
      const current = await getBotConfig();
      const kind = current.presenceActivity;
      if (!ACTIVITY_TYPES[kind]) return;

      const patch = {};
      if (kind === "custom") {
        patch.presenceState = field("state");
      } else {
        patch.presenceName = field("name");
        patch.presenceState = field("state") || null;
      }

      if (kind === "streaming") {
        const url = field("url");
        if (!STREAM_URL.test(url)) {
          return interaction.reply({
            content: "Link inválido. Use um link do Twitch ou do YouTube (ex: https://twitch.tv/seucanal).",
            flags: EPHEMERAL,
          });
        }
        patch.presenceUrl = url;
      }

      const cfg = await saveBotConfig(patch);
      await applyPresence(client, cfg);
      return interaction.update({ components: buildStatusConfigPanel({ cfg }) });
    }

    default:
      return;
  }
}

module.exports = {
  openAparencia,
  handleAparenciaButton,
  handleAparenciaSelect,
  handleAparenciaModal,
};
