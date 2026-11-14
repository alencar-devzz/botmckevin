const { MessageFlags } = require("discord.js");
const { getSpotify } = require("../utils/spotify/activity");
const { buildNotice } = require("../ui/spotify");
const { buildCardPayload, rememberCard } = require("../handlers/spotifyHandlers");

// n!spotify [@pessoa]: card com a música que a pessoa está ouvindo no Spotify.
// Usa o Rich Presence do Discord (intent GuildPresences) e funciona para quem conectou o Spotify
// em Configurações > Conexões e deixou "Exibir Spotify como seu status" ligado.
module.exports = {
  name: "spotify",
  category: "Utilidades",
  description: "Mostra um card com a música que você (ou outra pessoa) está ouvindo no Spotify.",
  usage: "spotify [@pessoa]",

  async execute(message, args) {
    const aviso = async (content) => {
      const msg = await message.channel.send({
        components: buildNotice(content),
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
      });
      setTimeout(() => msg.delete().catch(() => {}), 10000);
    };

    // Sem argumento, é quem usou o comando; também aceita menção ou ID
    const targetId =
      message.mentions.users.first()?.id ?? args[0]?.match(/\d{17,20}/)?.[0] ?? message.author.id;
    const self = targetId === message.author.id;

    const member = await message.guild.members.fetch(targetId).catch(() => null);
    if (!member) return aviso("Não encontrei essa pessoa neste servidor.");

    const track = getSpotify(message.guild, targetId);
    if (!track) {
      return aviso(
        self
          ? "Você não está ouvindo nada no Spotify agora. Conecte o Spotify em Configurações > Conexões e ligue \"Exibir Spotify como seu status\"."
          : "Essa pessoa não está ouvindo nada no Spotify agora."
      );
    }

    const payload = await buildCardPayload({ track, member, userId: targetId });
    const sent = await message.channel.send(payload);
    rememberCard(sent.id, track);
  },
};
