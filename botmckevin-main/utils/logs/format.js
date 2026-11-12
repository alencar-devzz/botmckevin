const { ChannelType, PermissionsBitField } = require("discord.js");

// Cores: verde forte = coisas boas, vermelho forte = coisas ruins, branco = coisas banais
const COLORS = { green: 0x00c853, red: 0xe50000, white: 0xffffff };

const code = (value) => `\`${String(value ?? "").replaceAll("`", "'")}\``;

// Usuário: @menção — `nome` (`id`)
const userBlock = (user, label = "Usuário") =>
  `**${label}:** <@${user.id}> — ${code(user.username)} (${code(user.id)})`;

// Usuário: @menção (nome)
const userBrief = (user, label = "Usuário") => `**${label}:** <@${user.id}> (${user.username})`;

const channelBlock = (channel, label = "Canal") =>
  `**${label}:** <#${channel.id}> — ${code(channel.name)} (${code(channel.id)})`;

function codeBlock(text, max = 800) {
  const clean = String(text ?? "").replaceAll("```", "'''");
  if (!clean.trim()) return "```\n(vazio)\n```";
  return `\`\`\`\n${clean.length > max ? `${clean.slice(0, max - 1)}…` : clean}\n\`\`\``;
}

// 02/11/2026 às 06:24:10 (horário de Brasília)
function formatDateTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("day")}/${get("month")}/${get("year")} às ${get("hour")}:${get("minute")}:${get("second")}`;
}

// 5d 17h 36m
function formatSpan(ms) {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  return `${d}d ${h}h ${m}m`;
}

const unix = (date) => Math.floor(new Date(date).getTime() / 1000);

const CHANNEL_TYPES = {
  [ChannelType.GuildText]: "Texto",
  [ChannelType.GuildVoice]: "Voz",
  [ChannelType.GuildCategory]: "Categoria",
  [ChannelType.GuildAnnouncement]: "Anúncios",
  [ChannelType.GuildStageVoice]: "Palco",
  [ChannelType.GuildForum]: "Fórum",
  [ChannelType.GuildMedia]: "Mídia",
  [ChannelType.PublicThread]: "Tópico",
  [ChannelType.PrivateThread]: "Tópico privado",
  [ChannelType.AnnouncementThread]: "Tópico de anúncios",
};
const channelTypeName = (type) => CHANNEL_TYPES[type] ?? "Outro";

const PERM_PT = {
  CreateInstantInvite: "Criar convite",
  KickMembers: "Expulsar membros",
  BanMembers: "Banir membros",
  Administrator: "Administrador",
  ManageChannels: "Gerenciar canais",
  ManageGuild: "Gerenciar servidor",
  AddReactions: "Adicionar reações",
  ViewAuditLog: "Ver registro de auditoria",
  PrioritySpeaker: "Voz prioritária",
  Stream: "Transmitir",
  ViewChannel: "Ver canal",
  SendMessages: "Enviar mensagens",
  SendTTSMessages: "Enviar mensagens TTS",
  ManageMessages: "Gerenciar mensagens",
  EmbedLinks: "Inserir links",
  AttachFiles: "Anexar arquivos",
  ReadMessageHistory: "Ver histórico de mensagens",
  MentionEveryone: "Mencionar everyone",
  UseExternalEmojis: "Usar emojis externos",
  ViewGuildInsights: "Ver análises do servidor",
  Connect: "Conectar",
  Speak: "Falar",
  MuteMembers: "Silenciar membros",
  DeafenMembers: "Ensurdecer membros",
  MoveMembers: "Mover membros",
  UseVAD: "Usar detecção de voz",
  ChangeNickname: "Alterar apelido",
  ManageNicknames: "Gerenciar apelidos",
  ManageRoles: "Gerenciar cargos",
  ManageWebhooks: "Gerenciar webhooks",
  ManageGuildExpressions: "Gerenciar expressões",
  UseApplicationCommands: "Usar comandos de apps",
  RequestToSpeak: "Pedir para falar",
  ManageEvents: "Gerenciar eventos",
  ManageThreads: "Gerenciar tópicos",
  CreatePublicThreads: "Criar tópicos públicos",
  CreatePrivateThreads: "Criar tópicos privados",
  UseExternalStickers: "Usar figurinhas externas",
  SendMessagesInThreads: "Enviar mensagens em tópicos",
  UseEmbeddedActivities: "Usar atividades",
  ModerateMembers: "Castigar membros",
  SendVoiceMessages: "Enviar mensagens de voz",
  SendPolls: "Criar enquetes",
  UseExternalApps: "Usar apps externos",
  UseSoundboard: "Usar soundboard",
  UseExternalSounds: "Usar sons externos",
  CreateEvents: "Criar eventos",
  CreateGuildExpressions: "Criar expressões",
  PinMessages: "Fixar mensagens",
  BypassSlowmode: "Ignorar modo lento",
};

const permName = (flag) => PERM_PT[flag] ?? flag.replace(/([a-z])([A-Z])/g, "$1 $2");

// Estado de uma permissão dentro de um overwrite de canal
function overwriteState(overwrite, bit) {
  if (!overwrite) return "Neutro";
  if (BigInt(overwrite.allow.bitfield) & bit) return "Permitido";
  if (BigInt(overwrite.deny.bitfield) & bit) return "Negado";
  return "Neutro";
}

// Diferenças de permissões entre dois canais, agrupadas por cargo/membro
function diffOverwrites(oldChannel, newChannel) {
  const before = oldChannel.permissionOverwrites.cache;
  const after = newChannel.permissionOverwrites.cache;
  const ids = new Set([...before.keys(), ...after.keys()]);
  const groups = [];

  for (const id of ids) {
    const o = before.get(id);
    const n = after.get(id);
    const lines = [];
    for (const [name, bit] of Object.entries(PermissionsBitField.Flags)) {
      const a = overwriteState(o, bit);
      const b = overwriteState(n, bit);
      if (a !== b) lines.push(`• ${code(permName(name))}: ${a} → ${b}`);
    }
    if (!lines.length) continue;

    const type = (n ?? o).type;
    const who = id === newChannel.guild.id ? "@everyone" : type === 0 ? `<@&${id}>` : `<@${id}>`;
    groups.push({ who, lines });
  }
  return groups;
}

module.exports = {
  COLORS,
  code,
  userBlock,
  userBrief,
  channelBlock,
  codeBlock,
  formatDateTime,
  formatSpan,
  unix,
  channelTypeName,
  permName,
  diffOverwrites,
};
