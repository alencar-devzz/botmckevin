const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require("discord.js");
const { buildBadgesSelectPanel, buildBadgesActionPanel } = require("../ui/badges");
const { encrypt, decrypt } = require("../utils/badgesCrypto");
const BadgesToken = require("../database/models/BadgesToken");

const V2       = MessageFlags.IsComponentsV2;
const EPHEMERAL = MessageFlags.Ephemeral;

const notice = (content) => [
  new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
    .addSeparatorComponents(new SeparatorBuilder()),
];

// ─── API do Discord via token de conta ───────────────────────────────────────
const HOUSE_ID = { bravery: 1, brilliance: 2, balance: 3 };

async function discordApi(token, path, method = "GET", body = null) {
  const opts = {
    method,
    headers: { Authorization: token, "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(`https://discord.com/api/v10${path}`, opts);
  const json = res.ok ? await res.json().catch(() => ({})) : null;
  return { ok: res.ok, status: res.status, json };
}

async function getCurrentHouse(token) {
  const { ok, json } = await discordApi(token, "/users/@me");
  if (!ok || !json) return null;
  const flags = json.flags ?? 0;
  if (flags & 64)  return "bravery";
  if (flags & 128) return "brilliance";
  if (flags & 256) return "balance";
  return null;
}

// ─── Token: carrega do MongoDB e decifra ─────────────────────────────────────
async function loadToken(userId) {
  const doc = await BadgesToken.findOne({ userId }).lean();
  if (!doc) return null;
  try { return decrypt(doc.encrypted); }
  catch { return null; }
}

async function saveToken(userId, plainToken) {
  const encrypted = encrypt(plainToken);
  await BadgesToken.updateOne({ userId }, { $set: { encrypted, updatedAt: new Date() } }, { upsert: true });
}

// ─── Helpers de resposta ─────────────────────────────────────────────────────
function replyEphemeral(interaction, components) {
  return interaction.reply({ components, flags: V2 | EPHEMERAL });
}

function editEphemeral(interaction, components) {
  return interaction.editReply({ components, flags: V2 });
}

function updateEphemeral(interaction, components) {
  return interaction.update({ components, flags: V2 | EPHEMERAL });
}

// ─── Select no painel público (menu "Configurar conta") ──────────────────────
async function handleBadgesMenuSelect(interaction) {
  if (interaction.values[0] !== "config") return;

  await interaction.deferReply({ flags: EPHEMERAL });

  const token = await loadToken(interaction.user.id);
  if (token) {
    // Já tem conta: vai direto para o select de casas
    const currentHouse = await getCurrentHouse(token);
    return editEphemeral(interaction, buildBadgesSelectPanel(currentHouse));
  }

  // Sem conta: abre modal para inserir o token
  // deferReply já foi chamado; precisamos trocar para showModal — não dá depois de defer.
  // Estratégia: editReply com instrução e um botão que abre o modal.
  return editEphemeral(interaction, [
    new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            "**Vincular conta**",
            "-# Clique no botao abaixo para inserir o token da sua conta do Discord.",
            "",
            "> O token e armazenado de forma criptografada e so e usado para gerenciar sua badge HypeSquad.",
          ].join("\n")
        )
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("badges:open_modal")
            .setLabel("Inserir token")
            .setStyle(ButtonStyle.Secondary)
        )
      ),
  ]);
}

// ─── Botões ───────────────────────────────────────────────────────────────────
async function handleBadgesButton(interaction) {
  const { customId } = interaction;

  // Abre modal para inserir token (vindo do botão "Inserir token")
  if (customId === "badges:open_modal") {
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId("badges:modal:token")
        .setTitle("Inserir token da conta")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("token")
              .setLabel("Token da sua conta do Discord")
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("Cole aqui o token")
              .setRequired(true)
          )
        )
    );
  }

  // Adicionar badge
  if (customId.startsWith("badges:add:")) {
    const house = customId.split(":")[2];
    const token = await loadToken(interaction.user.id);
    if (!token) return replyEphemeral(interaction, notice("Conta nao configurada. Use o menu **Configurar conta** para vincular seu token."));

    await interaction.deferUpdate();

    // Verifica se já tem antes de adicionar
    const currentHouse = await getCurrentHouse(token);
    if (currentHouse === house) {
      return editEphemeral(interaction, buildBadgesActionPanel(house, currentHouse));
    }

    const { ok, status } = await discordApi(token, "/hypesquad/online", "POST", { house_id: HOUSE_ID[house] });
    if (!ok) {
      return editEphemeral(interaction, notice(`Nao foi possivel adicionar a badge. Verifique se o token esta correto. (\`${status}\`)`));
    }

    return editEphemeral(interaction, buildBadgesActionPanel(house, house));
  }

  // Remover badge
  if (customId.startsWith("badges:remove:")) {
    const house = customId.split(":")[2];
    const token = await loadToken(interaction.user.id);
    if (!token) return replyEphemeral(interaction, notice("Conta nao configurada. Use o menu **Configurar conta** para vincular seu token."));

    await interaction.deferUpdate();

    // Verifica se ainda tem antes de remover
    const currentHouse = await getCurrentHouse(token);
    if (currentHouse !== house) {
      return editEphemeral(interaction, buildBadgesActionPanel(house, currentHouse));
    }

    const { ok, status } = await discordApi(token, "/hypesquad/online", "DELETE");
    if (!ok) {
      return editEphemeral(interaction, notice(`Nao foi possivel remover a badge. Verifique se o token esta correto. (\`${status}\`)`));
    }

    return editEphemeral(interaction, buildBadgesActionPanel(house, null));
  }
}

// ─── Select de casa ───────────────────────────────────────────────────────────
async function handleBadgesSelect(interaction) {
  if (interaction.customId === "badges:menu") return handleBadgesMenuSelect(interaction);

  // badges:house
  const house = interaction.values[0];
  const token = await loadToken(interaction.user.id);
  if (!token) return replyEphemeral(interaction, notice("Conta nao configurada. Use o menu **Configurar conta** para vincular seu token."));

  await interaction.deferUpdate();
  const currentHouse = await getCurrentHouse(token);
  return editEphemeral(interaction, buildBadgesActionPanel(house, currentHouse));
}

// ─── Modal ────────────────────────────────────────────────────────────────────
async function handleBadgesModal(interaction) {
  const rawToken = interaction.fields.getTextInputValue("token").trim();
  await interaction.deferReply({ flags: EPHEMERAL });

  const { ok, status } = await discordApi(rawToken, "/users/@me");
  if (!ok) {
    return editEphemeral(interaction, notice(`Token invalido ou sem permissao. (\`${status}\`)\n-# Verifique se copiou o token corretamente e tente de novo.`));
  }

  await saveToken(interaction.user.id, rawToken);

  const currentHouse = await getCurrentHouse(rawToken);
  return editEphemeral(interaction, buildBadgesSelectPanel(currentHouse));
}

module.exports = { handleBadgesButton, handleBadgesSelect, handleBadgesModal };
