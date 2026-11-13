const { getNukeConfig, canUseNuke } = require("../utils/nuke/store");
const { nukeChannel, nukeBlocker, cooldownLeft } = require("../utils/nuke/engine");
const { suppressMessage } = require("../utils/logs/suppress");

// Aviso curto no canal (some sozinho)
async function notice(channel, content, seconds = 5) {
  const sent = await channel.send({ content, allowedMentions: { parse: [] } }).catch(() => null);
  if (sent) {
    suppressMessage(sent.id);
    setTimeout(() => sent.delete().catch(() => {}), seconds * 1000);
  }
}

module.exports = {
  name: "nnuke",
  category: "Moderação",
  description: "Recria o canal do zero (mesmo nome, permissões e categoria) e apaga o antigo.",
  usage: "nnuke",
  staffOnly: true,

  async execute(message) {
    const { guild, channel, member } = message;
    if (!guild || !member) return;

    const cfg = await getNukeConfig(guild.id);
    if (!cfg.enabled) return notice(channel, "O comando **nnuke** está desativado neste servidor.");

    const verdict = canUseNuke(cfg, member, channel);
    if (!verdict.ok) {
      const texts = {
        protected: "Este canal é protegido e não pode ser recriado.",
        channel: "O comando **nnuke** não pode ser usado neste canal.",
        role: "Você não tem permissão para usar este comando.",
      };
      return notice(channel, texts[verdict.reason] ?? texts.role);
    }

    const blocker = nukeBlocker(channel);
    if (blocker) return notice(channel, blocker, 6);

    const left = cooldownLeft(cfg, member, verdict.admin);
    if (left > 0) {
      return notice(channel, `<@${member.id}> aguarde **${Math.ceil(left / 1000)}s** para usar o \`nnuke\` de novo.`, 4);
    }

    const result = await nukeChannel({ channel, member, cfg });
    if (!result.ok) await notice(channel, result.error, 8);
  },
};
