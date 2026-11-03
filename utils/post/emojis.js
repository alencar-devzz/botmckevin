// Emojis padrão dos botões do sistema de posts.
// Para mostrar o ícone do Instagram ao lado da menção no topo do post,
// preencha "instagram" com { name: "nome_do_emoji", id: "ID_DO_EMOJI" }.
// (O emoji de cada botão também pode ser trocado pelo painel: Posts e Instagram → Botões do post.)
const EMOJIS = {
  like: { name: "emoji_5", id: "1567303864011464825" },
  comment: { name: "emoji_7", id: "1567309587890053230" },
  delete: { name: "emoji_6", id: "1567306086229483691" },
  view: { name: "emoji_4", id: "1567301404916191304" },
  instagram: null,
};

const CUSTOM_RE = /^<(a?):([A-Za-z0-9_]{2,32}):(\d{15,25})>$/;
const UNICODE_RE = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3)/u;

function graphemeCount(value) {
  if (typeof Intl.Segmenter === "function") {
    return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)].length;
  }
  return 1;
}

// Converte o que está salvo (string) no formato que o discord.js aceita em setEmoji()
// Se não houver emoji salvo, usa o padrão.
function resolveEmoji(stored, fallback) {
  if (stored) {
    const match = CUSTOM_RE.exec(stored);
    if (match) return { animated: match[1] === "a", name: match[2], id: match[3] };
    return stored;
  }
  return fallback ?? null;
}

// Texto de um emoji para usar dentro de mensagens
function emojiMarkup(emoji) {
  if (!emoji) return "";
  if (typeof emoji === "string") return `${emoji} `;
  return `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}> `;
}

// Valida o que o usuário digitou no modal.
// Retorna { ok: true, value } ou { ok: false, error }
function parseEmojiInput(raw, client) {
  const input = String(raw ?? "").trim();

  const custom = CUSTOM_RE.exec(input);
  if (custom) {
    if (!client.emojis.cache.has(custom[3])) {
      return {
        ok: false,
        error:
          "Não consegui acessar esse emoji. O bot precisa estar no servidor onde ele foi criado.",
      };
    }
    return { ok: true, value: input };
  }

  if (UNICODE_RE.test(input) && graphemeCount(input) === 1) {
    return { ok: true, value: input };
  }

  return {
    ok: false,
    error:
      "Emoji inválido. Envie um emoji normal (ex.: ❤️) ou um personalizado no formato `<:nome:id>`.",
  };
}

module.exports = { EMOJIS, emojiMarkup, resolveEmoji, parseEmojiInput };
