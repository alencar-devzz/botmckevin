const {
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
} = require("discord.js");
const { formatMessage } = require("./formatMessage");
const { COLORS } = require("./logs/format");

const DEFAULTS = {
  welcome: (member) => `Bem-vindo(a) ao **${member.guild.name}**, <@${member.id}>!`,
  leave: (member) => `<@${member.id}> saiu do servidor.`,
  dm: (member) => `Seja bem-vindo(a) ao **${member.guild.name}**!`,
};

const text = (content) => new TextDisplayBuilder().setContent(String(content).slice(0, 3500));

function avatarOf(member) {
  return (member.user ?? member).displayAvatarURL({ extension: "png", size: 256 });
}

// Mensagem de boas-vindas / saída no formato "container" (com a foto do membro)
function buildGreetingContainer(kind, member, content) {
  const title = kind === "welcome" ? "### Novo membro" : "### Saída de membro";
  return new ContainerBuilder()
    .setAccentColor(kind === "welcome" ? COLORS.green : COLORS.red)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(text(title), text(content))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarOf(member)))
    );
}

// Mensagem enviada na DM (a DM não mostra de qual servidor veio, então o rodapé informa)
function buildDmContainer(member, content) {
  return new ContainerBuilder()
    .setAccentColor(COLORS.green)
    .addTextDisplayComponents(text(`### Bem-vindo(a) ao ${member.guild.name}`), text(content))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      text(`-# Mensagem enviada automaticamente pelo servidor **${member.guild.name}**.`)
    );
}

function scheduleDelete(message, seconds) {
  if (!seconds || seconds <= 0) return;
  setTimeout(() => message.delete().catch(() => {}), seconds * 1000);
}

// kind: "welcome" | "leave". Retorna a mensagem enviada ou null.
async function sendGreeting(kind, member, config, { force = false } = {}) {
  const enabled = kind === "welcome" ? config.welcomeEnabled : config.leaveEnabled;
  const channelId = kind === "welcome" ? config.welcomeChannel : config.leaveChannel;
  if ((!enabled && !force) || !channelId) return null;

  const channel = member.guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return null;

  const template = kind === "welcome" ? config.welcomeMessage : config.leaveMessage;
  const style = kind === "welcome" ? config.welcomeStyle : config.leaveStyle;
  const content = formatMessage(template, member) ?? DEFAULTS[kind](member);

  const payload =
    style === "container"
      ? {
          components: [buildGreetingContainer(kind, member, content)],
          flags: MessageFlags.IsComponentsV2,
        }
      : { content };

  const sent = await channel.send(payload).catch(() => null);
  if (sent) {
    scheduleDelete(sent, kind === "welcome" ? config.welcomeDeleteAfter : config.leaveDeleteAfter);
  }
  return sent;
}

// Retorna true se a DM foi entregue (DMs fechadas falham em silêncio)
async function sendWelcomeDm(member, config, { force = false } = {}) {
  if (!config.dmEnabled && !force) return false;
  const content = formatMessage(config.dmMessage, member) ?? DEFAULTS.dm(member);
  try {
    await member.send({
      components: [buildDmContainer(member, content)],
      flags: MessageFlags.IsComponentsV2,
    });
    return true;
  } catch {
    return false;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

function accountAgeDays(member) {
  return (Date.now() - member.user.createdTimestamp) / DAY_MS;
}

module.exports = { sendGreeting, sendWelcomeDm, accountAgeDays };
