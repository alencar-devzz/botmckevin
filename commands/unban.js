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

// Lista de banidos guardada por poucos segundos: o autocomplete é chamado a cada letra digitada
const BAN_CACHE_MS = 15_000;
const banCache = new Map(); // guildId -> { at, list }

async function listBans(guild) {
  const cached = banCache.get(guild.id);
  if (cached && Date.now() - cached.at < BAN_CACHE_MS) return cached.list;
  const bans = await guild.bans.fetch({ limit: 1000, cache: false });
  const list = [...bans.values()].map((b) => b.user);
  banCache.set(guild.id, { at: Date.now(), list });
  return list;
}

const idFrom = (text) => String(text ?? "").match(/\d{17,20}/)?.[0] ?? null;

module.exports = {
  name: "unban",

  // /unban usuario:(lista de banidos do servidor, ou o ID) motivo:texto
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Remove o banimento de um usuário.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) =>
      o
        .setName("usuario")
        .setDescription("Escolha na lista de banidos (ou cole o ID).")
        .setAutocomplete(true)
        .setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("motivo").setDescription("Motivo do desbanimento.").setMaxLength(512)
    ),

  // Menu nativo do Discord (autocomplete) com os usuários banidos do servidor
  async autocomplete(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers)) {
      return interaction.respond([]);
    }

    const focused = String(interaction.options.getFocused() ?? "").trim().toLowerCase();
    let users;
    try {
      users = await listBans(interaction.guild);
    } catch {
      return interaction.respond([]); // bot sem permissão de ver os banimentos
    }

    const found = users
      .filter(
        (u) =>
          !focused ||
          u.username.toLowerCase().includes(focused) ||
          u.globalName?.toLowerCase().includes(focused) ||
          u.id.includes(focused)
      )
      .sort((a, b) => a.username.localeCompare(b.username))
      .slice(0, 25)
      .map((u) => ({
        name: `${u.globalName && u.globalName !== u.username ? `${u.globalName} · ` : ""}${u.username} (${u.id})`.slice(0, 100),
        value: u.id,
      }));

    return interaction.respond(found);
  },

  async executeSlash(interaction) {
    const permitido = await requirePermission(
      interaction,
      PermissionFlagsBits.BanMembers,
      "Você não tem permissão para desbanir membros."
    );
    if (!permitido) return;

    const userId = idFrom(interaction.options.getString("usuario", true));
    const reason = interaction.options.getString("motivo")?.trim() || null;
    if (!userId) {
      return replyEphemeral(interaction, "Escolha alguém na lista de banidos ou cole o ID.");
    }

    const banEntry = await interaction.guild.bans.fetch({ user: userId, force: true }).catch(() => null);
    if (!banEntry) {
      return replyEphemeral(interaction, "Esse usuário não está banido.");
    }
    const user = banEntry.user;

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
