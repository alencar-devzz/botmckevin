const { activeCategory, deliver } = require("./send");
const { add, listLimited } = require("./batch");
const { COLORS, userBlock, channelBlock, code } = require("./format");

const members = (channel) => [...channel.members.values()];
const listUsers = (list) => (list.length ? list.map((m) => `<@${m.id}>`).join(" ") : code("ninguém"));

// Um evento sozinho continua com a embed detalhada; vários seguidos viram uma embed única
async function flushVoice(guild, cfg, items) {
  if (items.length === 1) return deliver(guild, cfg, items[0].spec);

  const joins = items.filter((i) => i.kind === "join");
  const leaves = items.filter((i) => i.kind === "leave");
  const moves = items.filter((i) => i.kind === "move");
  const people = new Set(items.map((i) => i.userId));

  const groups = [
    [
      `**Total de eventos:** ${code(items.length)}`,
      `**Pessoas envolvidas:** ${code(people.size)}`,
      `**Entraram:** ${code(joins.length)} · **Saíram:** ${code(leaves.length)} · **Trocaram de call:** ${code(moves.length)}`,
    ],
  ];
  if (joins.length) {
    groups.push(["**Entraram**", ...listLimited(joins.map((i) => `<@${i.userId}> → <#${i.toId}>`))]);
  }
  if (leaves.length) {
    groups.push(["**Saíram**", ...listLimited(leaves.map((i) => `<@${i.userId}> ← <#${i.fromId}>`))]);
  }
  if (moves.length) {
    groups.push(["**Trocaram de call**", ...listLimited(moves.map((i) => `<@${i.userId}> <#${i.fromId}> → <#${i.toId}>`))]);
  }

  const color = leaves.length && !joins.length && !moves.length ? COLORS.red : COLORS.white;
  return deliver(guild, cfg, {
    title: `Voz — Atividade em massa — ${guild.name}`,
    color,
    groups,
  });
}

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
      let item;

      if (!oldState.channelId && newState.channelId) {
        // Entrou
        const inCall = members(newState.channel);
        item = {
          kind: "join",
          toId: newState.channelId,
          spec: {
            ...base,
            title: `Voz — Entrou — ${guild.name}`,
            color: COLORS.green,
            groups: [
              [userBlock(member.user)],
              [channelBlock(newState.channel), `**Na call (${inCall.length}):** ${listUsers(inCall)}`],
            ],
          },
        };
      } else if (oldState.channelId && !newState.channelId) {
        // Saiu
        const left = members(oldState.channel);
        item = {
          kind: "leave",
          fromId: oldState.channelId,
          spec: {
            ...base,
            title: `Voz — Saiu — ${guild.name}`,
            color: COLORS.red,
            groups: [
              [userBlock(member.user)],
              [channelBlock(oldState.channel), `**Restam (${left.length}):** ${listUsers(left)}`],
            ],
          },
        };
      } else {
        // Trocou de call
        const inNew = members(newState.channel);
        item = {
          kind: "move",
          fromId: oldState.channelId,
          toId: newState.channelId,
          spec: {
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
          },
        };
      }

      item.userId = member.id;
      add(`voice:${guild.id}`, item, (items) => flushVoice(guild, cfg, items), { window: 2500, maxWait: 10000 });
    },
  },
];
