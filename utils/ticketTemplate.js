const {
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
} = require("discord.js");

// Texto livre: o que a pessoa digita é exatamente o que aparece (nada de ** ou ### automáticos).
// Marcadores especiais que podem ser digitados em QUALQUER texto dos painéis/tickets:
//   {separador}        -> linha separadora normal
//   {separador_largo}  -> linha separadora com mais espaço
//   {imagem}           -> todas as imagens da mensagem, nesse ponto
//   {imagem1}..{imagem5} -> uma imagem específica, nesse ponto
const TOKEN_REGEX = /\{(separador_largo|separador|imagem\d*)\}/gi;

const MAX_TEXT = 3000;
const MAX_BLOCKS = 12; // trava de segurança (o Discord limita 40 componentes por mensagem)

const TOKEN_HELP = "{separador} · {separador_largo} · {imagem} ou {imagem1}…{imagem5}";

const isBlank = (value) => !value || !String(value).trim();

const sepToken = (name) => name === "separador" || name === "separador_largo";

// A mensagem usa algum marcador de imagem? (então a galeria automática não é adicionada)
function usesImageToken(...texts) {
  return texts.some((t) => {
    if (isBlank(t)) return false;
    for (const m of String(t).matchAll(TOKEN_REGEX)) {
      if (!sepToken(m[1].toLowerCase())) return true;
    }
    return false;
  });
}

// O texto começa com um separador? (para não duplicar o separador automático)
function startsWithSeparator(text) {
  const m = /^\s*\{(separador_largo|separador)\}/i.exec(String(text ?? ""));
  return Boolean(m);
}

// Divide no primeiro marcador: { head, rest }. Usado onde só cabe texto (dentro de uma seção).
function splitAtFirstToken(text) {
  const value = String(text ?? "");
  TOKEN_REGEX.lastIndex = 0;
  const match = TOKEN_REGEX.exec(value);
  TOKEN_REGEX.lastIndex = 0;
  if (!match) return { head: value, rest: "" };
  return { head: value.slice(0, match.index), rest: value.slice(match.index) };
}

function buildGallery(urls) {
  return new MediaGalleryBuilder().addItems(
    urls.slice(0, 10).map((url) => new MediaGalleryItemBuilder().setURL(url))
  );
}

// Adiciona o texto no container, trocando os marcadores por separadores/imagens.
// prefix = texto colocado antes de cada trecho (ex: "-# " para texto pequeno).
function addTemplate(container, content, { images = [], prefix = "" } = {}) {
  if (isBlank(content)) return container;

  const value = String(content);
  let blocks = 0;
  let cursor = 0;

  const pushText = (raw) => {
    const trimmed = raw.replace(/^\s*\n/, "").replace(/\s+$/, "");
    if (isBlank(trimmed) || blocks >= MAX_BLOCKS) return;
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${prefix}${trimmed}`.slice(0, MAX_TEXT))
    );
    blocks++;
  };

  for (const match of value.matchAll(TOKEN_REGEX)) {
    pushText(value.slice(cursor, match.index));
    cursor = match.index + match[0].length;

    if (blocks >= MAX_BLOCKS) continue;
    const name = match[1].toLowerCase();

    if (name === "separador") {
      container.addSeparatorComponents(new SeparatorBuilder());
      blocks++;
    } else if (name === "separador_largo") {
      container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large)
      );
      blocks++;
    } else if (images.length) {
      // {imagem} = todas; {imagemN} = só a N
      const number = Number.parseInt(name.slice("imagem".length), 10);
      const picked = Number.isInteger(number) ? [images[number - 1]].filter(Boolean) : images;
      if (picked.length) {
        container.addMediaGalleryComponents(buildGallery(picked));
        blocks++;
      }
    }
  }
  pushText(value.slice(cursor));

  return container;
}

module.exports = {
  TOKEN_HELP,
  usesImageToken,
  startsWithSeparator,
  splitAtFirstToken,
  addTemplate,
  buildGallery,
};
