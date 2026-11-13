// Emojis dos botões do sistema de posts.
// Para mostrar o ícone do Instagram ao lado da menção no topo do post,
// preencha "instagram" com { name: "nome_do_emoji", id: "ID_DO_EMOJI" }.
const EMOJIS = {
  like: { name: "emoji_5", id: "1567303864011464825" },
  comment: { name: "emoji_7", id: "1567309587890053230" },
  delete: { name: "emoji_6", id: "1567306086229483691" },
  view: { name: "emoji_4", id: "1567301404916191304" },
  instagram: null,
};

function emojiMarkup(emoji) {
  return emoji ? `<:${emoji.name}:${emoji.id}> ` : "";
}

module.exports = { EMOJIS, emojiMarkup };
