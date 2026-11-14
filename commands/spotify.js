const { MessageFlags } = require("discord.js");
const { getSpotify } = require("../utils/spotify/activity");
const { buildNotice } = require("../ui/spotify");
const { buildCardPayload, rememberCard } = require("../handlers/spotifyHandlers");
const {
  getSpotifyConfig,
  canUseSpotify,
  cooldownLeft,
  startCooldown,
} = require("../utils/spotify/store");
const { scheduleCardDelete } = require("../utils/spotify/autoDelete");

// n!spotify [@pessoa]: card com a música que a pessoa está ouvindo no Spotify.
// Usa o Rich Presence do Discord (intent GuildPresences) e funciona para quem conectou o Spotify
// em Configurações > Conexões e deixou "Exibir Spotify como seu status" ligado.
// Regras de uso, aparência, botões e comportamento: n!menu > Comunidade e interação > Comando spotify.
module.exports = {
  name: "spotify",
  category: "Utilidades",
  description: "Mostra um card com a música que você (ou outra pessoa) está ouvindo no Spotify.",
  usage: "spotify [@pessoa]",

  async execute(message, args) {
    const aviso = async (content, seconds = 10) => {
      const msg = await message.channel.send({
        components: buildNotice(content),
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
      });
      setTimeout(() => msg.delete().catch(() => {}), seconds * 1000);
    };

    const { guild, channel, author } = message;
    const cfg = await getSpotifyConfig(guild.id);

    // Sem argumento, é quem usou o comando; também aceita menção ou ID
    const targetId = message.mentions.users.first()?.id ?? args[0]?.match(/\d{17,20}/)?.[0] ?? author.id;
    const self = targetId === author.id;

    const verdict = canUseSpotify(cfg, message.member, channel, { self });
    if (!verdict.ok) {
      const reasons = {
        disabled: "O comando `spotify` está desativado neste servidor.",
        channel: `O comando \`spotify\` só funciona em: ${cfg.allowedChannels.map((id) => `<#${id}>`).join(" ")}`,
        role: "Você não tem um cargo que pode usar o comando `spotify`.",
        others: "Neste servidor o comando `spotify` só mostra a sua própria música.",
      };
      return aviso(reasons[verdict.reason], 6);
    }

    // Espera entre usos (administradores e o dono não esperam)
    if (!verdict.admin) {
      const left = cooldownLeft(cfg, guild.id, author.id);
      if (left > 0) {
        return aviso(`<@${author.id}> aguarde **${Math.ceil(left / 1000)}s** para usar o \`spotify\` de novo.`, 4);
      }
    }

    const member = await guild.members.fetch(targetId).catch(() => null);
    if (!member) return aviso("Não encontrei essa pessoa neste servidor.");

    const track = getSpotify(guild, targetId);
    if (!track) {
      // Mensagem personalizada do painel ({user} = menção, {name} = nome); vazia = mensagem padrão
      const custom = cfg.notListeningMessage
        .replaceAll("{user}", `<@${targetId}>`)
        .replaceAll("{name}", member.displayName)
        .trim();
      return aviso(
        custom ||
          (self
            ? "Você não está ouvindo nada no Spotify agora. Conecte o Spotify em Configurações > Conexões e ligue \"Exibir Spotify como seu status\"."
            : "Essa pessoa não está ouvindo nada no Spotify agora.")
      );
    }

    // A espera só conta quando o card sai (aviso de "não está ouvindo" não gasta a vez)
    if (!verdict.admin) startCooldown(guild.id, author.id);

    const payload = await buildCardPayload({ track, member, userId: targetId, cfg });
    const sent = await channel.send(payload);
    rememberCard(sent.id, track);
    await scheduleCardDelete(message.client, sent, cfg.autoDeleteMinutes);
  },
};
