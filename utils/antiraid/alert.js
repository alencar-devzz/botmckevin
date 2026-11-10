const { MessageFlags } = require("discord.js");
const { buildLogComponents } = require("../logs/render");

// Alerta padrão dos módulos de proteção, no mesmo estilo dos logs do servidor:
// container colorido, título, miniatura opcional, blocos separados e data/hora no rodapé.
// channelId vazio = usa o canal de alertas do núcleo.
//
// Formas de usar:
//   { title, groups: [[linhas do 1º bloco], [linhas do 2º bloco], ...], thumbnail?, color? }
//   { title, lines: ["**Campo**  valor", ...], thumbnail?, color? }   (forma antiga, convertida sozinha)
const RED = 0xe50000;

// "**Autor**  valor" -> "**Autor:** valor"
const toField = (line) => String(line).replace(/^\*\*(.+?)\*\*\s{2,}/, "**$1:** ");

function toGroups({ groups, lines }) {
  if (Array.isArray(groups) && groups.length) return groups;
  const all = (lines ?? []).map(toField);
  return [all];
}

async function sendModuleAlert(guild, cfg, channelId, { title, lines, groups, thumbnail, color = RED }) {
  const id = channelId || cfg.core.alertChannelId;
  const channel = id ? guild.channels.cache.get(id) : null;
  if (!channel?.isTextBased()) return;
  await channel
    .send({
      components: buildLogComponents({ title, color, thumbnail, groups: toGroups({ groups, lines }) }),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    })
    .catch(() => {});
}

module.exports = { sendModuleAlert };
