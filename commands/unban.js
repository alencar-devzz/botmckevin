const {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  InteractionContextType,
} = require("discord.js");
const { resolveTarget } = require("../utils/resolveTarget");
const { buildConfirmPanel } = require("../ui/moderation");
const { setPendingModeration } = require("../utils/pendingModeration");
const { replyEphemeral, requirePermission, sendConfirm } = require("../utils/slashModeration");

// Cache curto da lista de banidos por servidor (autocomplete tem só 3s para responder
// e é chamado a cada letra digitada).
const BANS_CACHE_MS = 15000;
const bansCache = new Map();

async function getBans(guild) {
  const cached = bansCache.get(guild.id);
  if (cached && Date.now() - cached.at < BANS_CACHE_MS) return cached.list;

  const fetched = await guild.bans.fetch({ limit: 1000 });
  const list = [...fetched.values()].map((b) => ({
    id: b.user.id,
    tag: b.user.tag ?? b.user.username,
    username: b.user.username,
    reason: b.reason,
  }));
  bansCache.set(guild.id, { at: Date.now(), list });
  return list;
}

module.exports = {
  name: "unban",

  // Lista de banidos no campo "usuario" (aparece o menu pequeno em cima do campo).
  async autocomplete(interaction) {
    if (!interaction.guild) return interaction.respond([]);

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers)) {
      return interaction.respond([]);
    }

    let bans;
    try {
      bans = await getBans(interaction.guild);
    } catch {
      return interaction.respond([]);
    }

    const busca = interaction.options.getFocused().trim().toLowerCase();
    const filtrados = bans
      .filter(
        (b) =>
          !busca ||
          b.tag.toLowerCase().includes(busca) ||
          b.username.toLowerCase().includes(busca) ||
          b.id.includes(busca)
      )
      .slice(0, 25)
      .map((b) => ({
        name: `${b.tag} (${b.id})`.slice(0, 100),
        value: b.id,
      }));

    return interaction.respond(filtrados).catch(() => {});
  },

  // /unban usuario:@pessoa (ou o ID de quem está banido) motivo:texto
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Remove o banimento de um usuário.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) =>
      o
        .setName("usuario")
        .setDescription("Quem será desbanido (escolha na lista de banidos ou cole o ID).")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((o) =>
      o.setName("motivo").setDescription("Motivo do desbanimento.").setMaxLength(512)
    ),

  async executeSlash(interaction) {
    const permitido = await requirePermission(
      interaction,
      PermissionFlagsBits.BanMembers,
      "Você não tem permissão para desbanir membros."
    );
    if (!permitido) return;

    const input = interaction.options.getString("usuario", true).trim();
    const reason = interaction.options.getString("motivo")?.trim() || null;

    // O valor vem do autocomplete (ID); aceita também "<@id>" ou um ID colado.
    const id = input.match(/\d{17,20}/)?.[0];
    if (!id) {
      return replyEphemeral(
        interaction,
        "Escolha alguém da lista de banidos ou cole o ID do usuário."
      );
    }

    const banEntry = await interaction.guild.bans.fetch(id).catch(() => null);
    if (!banEntry) {
      return replyEphemeral(interaction, "Esse usuário não está banido.");
    }
    const user = banEntry.user;
    bansCache.delete(interaction.guild.id);

    return sendConfirm(interaction, {
      action: "unban",
      title: `Unban · ${user.tag ?? user.username}`,
      question: `Deseja realmente desbanir <@${user.id}> do servidor?`,
      user,
      member: null,
      reason,
    });
  },

  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      const aviso = await message.channel.send("Você não tem permissão para desbanir membros.");
      setTimeout(() => aviso.delete().catch(() => {}), 5000);
      return;
    }

    const { user, reason, error } = await resolveTarget(message, args);
    if (error) {
      const aviso = await message.channel.send(error);
      setTimeout(() => aviso.delete().catch(() => {}), 5000);
      return;
    }

    const banEntry = await message.guild.bans.fetch(user.id).catch(() => null);
    if (!banEntry) {
      const aviso = await message.channel.send("Esse usuário não está banido.");
      setTimeout(() => aviso.delete().catch(() => {}), 5000);
      return;
    }

    const mention = `<@${user.id}>`;
    const panelMsg = await message.channel.send({
      components: buildConfirmPanel({
        title: `Unban · ${user.tag ?? user.username}`,
        question: `Deseja realmente desbanir ${mention} do servidor?`,
        reason,
      }),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });

    setPendingModeration(
      panelMsg.id,
      {
        action: "unban",
        targetId: user.id,
        targetTag: user.tag ?? user.username,
        reason,
        guild: message.guild,
        message: panelMsg,
        authorId: message.author.id,
      },
      60000
    );
  },
};
