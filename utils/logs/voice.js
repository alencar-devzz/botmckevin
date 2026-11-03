const { activeCategory, deliver } = require("./send");
const { COLORS, userBlock, channelBlock, code } = require("./format");

const members = (channel) => [...channel.members.values()];
const listUsers = (list) => (list.length ? list.map((m) => `<@${m.id}>`).join(" ") : code("ninguém"));

module.exports = [
  {
    name: "voiceStateUpdate",
    async execute(oldState, newState) {
      const member = newState.member ?? oldState.member;
      if (!member) return;
      if (oldState.channelId === newState.channelId) return; // mute, câmera etc. não entram

      const { guild } = newState;
      const cfg = await activeCategory(guild, "calls", member.user.bot);
      if (!cfg) return;

      const base = { thumbnail: member.displayAvatarURL() };

      // Entrou
      if (!oldState.channelId && newState.channelId) {
        const inCall = members(newState.channel);
        return deliver(guild, cfg, {
          ...base,
          title: `Voz — Entrou — ${guild.name}`,
          color: COLORS.green,
          groups: [
            [userBlock(member.user)],
            [channelBlock(newState.channel), `**Na call (${inCall.length}):** ${listUsers(inCall)}`],
          ],
        });
      }

      // Saiu
      if (oldState.channelId && !newState.channelId) {
        const left = members(oldState.channel);
        return deliver(guild, cfg, {
          ...base,
          title: `Voz — Saiu — ${guild.name}`,
          color: COLORS.red,
          groups: [
            [userBlock(member.user)],
            [channelBlock(oldState.channel), `**Restam (${left.length}):** ${listUsers(left)}`],
          ],
        });
      }

      // Trocou de call
      const inNew = members(newState.channel);
      return deliver(guild, cfg, {
        ...base,
        title: `Voz — Trocou de call — ${guild.name}`,
        color: COLORS.white,
        groups: [
          [userBlock(member.user)],
          [
            channelBlock(oldState.channel, "De"),
            channelBlock(newState.channel, "Para"),
            `**Na call (${inNew.length}):** ${listUsers(inNew)}`,
          ],
        ],
      });
    },
  },
];
