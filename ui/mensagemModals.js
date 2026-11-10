const { TextInputStyle } = require("discord.js");
const { textLabel, selectLabel, uploadLabel, modal } = require("./modalHelpers");
const { BUTTON_STYLES, PLACES, parseHex } = require("../utils/msgBuilder/store");

// Modais do Criador de mensagens. IDs: "msg:modal:<ação>"

function buildTextModal(block, max) {
  return modal(
    "msg:modal:text",
    "Texto do bloco",
    textLabel({
      id: "text",
      label: "Texto",
      description: "Markdown aceito. Use [separador] ou [separador_largo] para dividir.",
      style: TextInputStyle.Paragraph,
      max,
      value: block.text,
      placeholder: "Escreva o texto deste bloco",
    })
  );
}

// kind: "main" (imagem principal) ou "thumb" (miniatura)
function buildImageModal(kind) {
  return modal(
    `msg:modal:${kind}`,
    kind === "main" ? "Imagem principal" : "Miniatura do bloco",
    uploadLabel({
      id: "file",
      label: "Enviar imagem",
      description: "Escolha uma imagem (png, jpg, gif ou webp) de até 4 MB.",
    }),
    textLabel({
      id: "link",
      label: "Ou use o link de uma imagem",
      description: "Só use se não enviou um arquivo acima.",
      max: 500,
      placeholder: "https://exemplo.com/imagem.png",
    })
  );
}

function buildHexModal(current) {
  return modal(
    "msg:modal:hex",
    "Cor personalizada",
    textLabel({
      id: "hex",
      label: "Cor em HEX",
      description: "Use #RRGGBB ou a forma curta #RGB.",
      max: 7,
      required: true,
      value: parseHex(current) ?? "",
      placeholder: "#5865F2",
    })
  );
}

// index: número do botão (0 ou 1) ou "new"; data: botão atual (ao editar)
function buildButtonModal(index, data) {
  const position = index === "new" ? "Novo botão" : `Botão ${Number(index) + 1}`;
  return modal(
    `msg:modal:btn:${index}`,
    position,
    textLabel({
      id: "label",
      label: "Texto do botão",
      description: "Opcional quando houver emoji.",
      max: 80,
      value: data?.label,
      placeholder: "Ex.: Regras",
    }),
    textLabel({
      id: "url",
      label: "Link (opcional)",
      description: "Com https:// vira botão de link. Vazio deixa o botão decorativo.",
      max: 500,
      value: data?.url,
      placeholder: "https://exemplo.com",
    }),
    textLabel({
      id: "emoji",
      label: "Emoji (opcional)",
      description: "Emoji do servidor no formato <:nome:id>, ou vazio.",
      max: 60,
      value: data?.emoji,
    }),
    selectLabel({
      id: "style",
      label: "Cor",
      description: "Botões de link usam a cor padrão do Discord.",
      options: Object.entries(BUTTON_STYLES).map(([value, label]) => ({ label, value, default: (data?.style ?? "secondary") === value })),
    }),
    selectLabel({
      id: "place",
      label: "Posição",
      options: Object.entries(PLACES).map(([value, label]) => ({ label, value, default: (data?.place ?? "inside") === value })),
    })
  );
}

function buildAudioModal() {
  return modal(
    "msg:modal:audio",
    "Arquivo de áudio",
    uploadLabel({
      id: "file",
      label: "Enviar arquivo",
      description: "MP3, WAV, M4A, OGG ou vídeo, até 8 MB.",
      required: true,
    })
  );
}

module.exports = { buildTextModal, buildImageModal, buildHexModal, buildButtonModal, buildAudioModal };
