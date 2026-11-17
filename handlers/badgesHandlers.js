const {
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require("discord.js");
const { buildBadgesSelectPanel, buildBadgesActionPanel, HYPESQUAD } = require("../ui/badges");

const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL = MessageFlags.Ephemeral;

const notice = (content) => [
  new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(content)),
];

// Mapeia house value -> número da API do Discord
const HOUSE_MAP = { bravery: 1, brilliance: 2, balance: 3 };

// Chama a API do Discord com o token do usuário
async function discordUserApi(token, path, method = "GET", body = null) {
  const opts = {
    method,
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0",
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`https://discord.com/api/v10${path}`, opts);
  const json = res.ok ? await res.json().catch(() => ({})) : null;
  return { ok: res.ok, status: res.status, json };
}

// Busca a casa HypeSquad atual do usuário com o token dele
async function getCurrentHouse(token) {
  const { ok, json } = await discordUserApi(token, "/users/@me");
  if (!ok || !json) return null;
  // flags do usuário: bit 6 = Bravery (64), bit 7 = Brilliance (128), bit 8 = Balance (256)
  const flags = json.flags ?? 0;
  if (flags & 64)  return "bravery";
  if (flags & 128) return "brilliance";
  if (flags & 256) return "balance";
  return null;
}

async function handleBadgesButton(interaction) {
  const { customId } = interaction;

  // Abre modal para inserir o token
  if (customId === "badges:config") {
    const modal = new ModalBuilder()
      .setCustomId("badges:modal:token")
      .setTitle("Configurar conta")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("token")
            .setLabel("Token da sua conta do Discord")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Cole aqui o token da sua conta")
            .setRequired(true)
        )
      );
    return interaction.showModal(modal);
  }

  // Botão Adicionar badge
  if (customId.startsWith("badges:add:")) {
    const house = customId.split(":")[2];
    const token = interaction.client.badgeTokens?.get(interaction.user.id);
    if (!token) {
      return interaction.reply({
        components: notice("Sessao expirada. Use Configurar conta novamente."),
        flags: V2 | EPHEMERAL,
      });
    }
    await interaction.deferReply({ flags: EPHEMERAL });
    const result = await discordUserApi(token, "/hypesquad/online", "POST", { house_id: HOUSE_MAP[house] });
    if (!result.ok) {
      return interaction.editReply({
        components: notice(`Nao consegui adicionar a badge. Verifique se o token esta correto. (${result.status})`),
        flags: V2,
      });
    }
    return interaction.editReply({
      components: buildBadgesActionPanel(house, true),
      flags: V2,
    });
  }

  // Botão Remover badge
  if (customId.startsWith("badges:remove:")) {
    const house = customId.split(":")[2];
    const token = interaction.client.badgeTokens?.get(interaction.user.id);
    if (!token) {
      return interaction.reply({
        components: notice("Sessao expirada. Use Configurar conta novamente."),
        flags: V2 | EPHEMERAL,
      });
    }
    await interaction.deferReply({ flags: EPHEMERAL });
    const result = await discordUserApi(token, "/hypesquad/online", "DELETE");
    if (!result.ok) {
      return interaction.editReply({
        components: notice(`Nao consegui remover a badge. Verifique se o token esta correto. (${result.status})`),
        flags: V2,
      });
    }
    return interaction.editReply({
      components: buildBadgesActionPanel(house, false),
      flags: V2,
    });
  }
}

async function handleBadgesSelect(interaction) {
  const house = interaction.values[0];
  const token = interaction.client.badgeTokens?.get(interaction.user.id);
  if (!token) {
    return interaction.reply({
      components: notice("Sessao expirada. Use Configurar conta novamente."),
      flags: V2 | EPHEMERAL,
    });
  }
  await interaction.deferUpdate();
  const currentHouse = await getCurrentHouse(token);
  const hasBadge = currentHouse === house;
  return interaction.editReply({
    components: buildBadgesActionPanel(house, hasBadge),
    flags: V2,
  });
}

async function handleBadgesModal(interaction) {
  const token = interaction.fields.getTextInputValue("token").trim();
  await interaction.deferReply({ flags: EPHEMERAL });

  // Valida o token consultando o usuário antes de guardar
  const { ok, status } = await discordUserApi(token, "/users/@me");
  if (!ok) {
    return interaction.editReply({
      components: notice(`Token invalido ou sem permissao. (${status})`),
      flags: V2,
    });
  }

  // Guarda o token em memória no client, associado ao userId
  if (!interaction.client.badgeTokens) interaction.client.badgeTokens = new Map();
  interaction.client.badgeTokens.set(interaction.user.id, token);

  const currentHouse = await getCurrentHouse(token);
  return interaction.editReply({
    components: buildBadgesSelectPanel(currentHouse),
    flags: V2,
  });
}

module.exports = { handleBadgesButton, handleBadgesSelect, handleBadgesModal };
