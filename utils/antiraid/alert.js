const { MessageFlags } = require("discord.js");
const { buildLogComponents } = require("../logs/render");
const { userBlock, channelBlock, codeBlock, code } = require("../logs/format");

// Log padrão de TODOS os módulos de proteção do Anti-Raid, no mesmo estilo do log do Anti-link:
//
//   ## Sistema — Ação                                   [avatar de quem fez]
//   **Autor:** @menção — `nome` (`id`)
//   ───────────────
//   **Canal:** #canal — `nome` (`id`)
//   **Sistema:** `Anti-link`
//   **Campo:** valor ...
//   ───────────────
//   **Conteúdo**            (só quando houver texto para mostrar)
//   ```texto```
//   ───────────────
//   09/11/2026 às 22:11:28
//
// Uso:
//   sendModuleAlert(guild, cfg, canalId, {
//     system: "Anti-spam",            nome do sistema (vira o início do título e a linha "Sistema")
//     action: "Spam detectado",       o que aconteceu (vira o fim do título)
//     author: user | "id",            quem fez (opcional). Aparece no topo e dá o avatar da miniatura
//     authorLabel: "Autor",           rótulo da linha de quem fez (Autor, Bot, Conta...)
//     channel: canal | "id",          canal onde aconteceu (opcional)
//     fields: [["Campo", "valor"], "linha solta"],
//     content: "texto",               mostrado num bloco de código (opcional)
//     color: 0xe50000,                vermelho por padrão
//   })
// channelId vazio = usa o canal de alertas do núcleo.
const RED = 0xe50000;

async function resolveUser(guild, author) {
  if (!author) return null;
  if (typeof author === "object") return author;
  return guild.client.users.cache.get(author) ?? (await guild.client.users.fetch(author).catch(() => null));
}

function channelLine(guild, channel) {
  if (!channel) return null;
  const found = typeof channel === "object" ? channel : guild.channels.cache.get(channel);
  return found ? channelBlock(found) : `**Canal:** <#${channel}> — ${code(channel)}`;
}

const fieldLine = (f) => (Array.isArray(f) ? `**${f[0]}:** ${f[1]}` : String(f));

// "**Autor**  valor" (formato antigo) -> "**Autor:** valor"
const toField = (line) => String(line).replace(/^\*\*(.+?)\*\*\s{2,}/, "**$1:** ");

async function sendModuleAlert(guild, cfg, channelId, spec) {
  const id = channelId || cfg.core.alertChannelId;
  const target = id ? guild.channels.cache.get(id) : null;
  if (!target?.isTextBased()) return;

  const { system, action, authorLabel = "Autor", fields = [], content, color = RED } = spec;

  // formato antigo (title + groups/lines) continua funcionando
  let title = spec.title;
  let groups = spec.groups;
  let thumbnail = spec.thumbnail;

  if (!title) {
    title = `${system} — ${action}`;
    const user = await resolveUser(guild, spec.author);
    const where = channelLine(guild, spec.channel);
    const sistema = `**Sistema:** ${code(system)}`;
    const details = fields.map(fieldLine);

    if (user || spec.author) {
      const who = user ? userBlock(user, authorLabel) : `**${authorLabel}:** <@${spec.author}> — ${code(spec.author)}`;
      groups = [[who], [...(where ? [where] : []), sistema, ...details]];
    } else {
      groups = [[...(where ? [where] : []), sistema], ...(details.length ? [details] : [])];
    }
    if (content !== undefined) groups.push(["**Conteúdo**", codeBlock(content)]);

    // miniatura: avatar de quem fez; sem pessoa, o ícone do servidor
    thumbnail =
      thumbnail ??
      user?.displayAvatarURL() ??
      guild.iconURL() ??
      guild.client.user.displayAvatarURL();
  } else if (!groups) {
    groups = [(spec.lines ?? []).map(toField)];
  }

  await target
    .send({
      components: buildLogComponents({ title, color, thumbnail, groups }),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    })
    .catch(() => {});
}

module.exports = { sendModuleAlert, code };
