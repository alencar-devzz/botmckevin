const { TextInputStyle } = require("discord.js");
const { textLabel, selectLabel, uploadLabel, modal } = require("./modalHelpers");
const { LIMITS, BUTTON_STYLES, PLACES, parseHex } = require("../utils/msgBuilder/store");

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

const IMAGE_TITLES = {
  main: "Imagem principal",
  thumb: "Miniatura do bloco",
  rimg: "Imagem da resposta",
  rthumb: "Miniatura da resposta",
};

// kind: "main" (imagem principal), "thumb" (miniatura), "rimg" e "rthumb" (imagem e miniatura da resposta de um botão)
function buildImageModal(kind) {
  return modal(
    `msg:modal:${kind}`,
    IMAGE_TITLES[kind] ?? "Imagem",
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

// id: "hex" (cor do bloco) ou "rhex" (cor da resposta de um botão)
function buildHexModal(current, id = "hex") {
  return modal(
    `msg:modal:${id}`,
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
      description: "Com https:// vira botão de link. Vazio permite uma resposta ao clique (configure em Resposta).",
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

// Texto da resposta. No embed também pede título e rodapé.
function buildResponseTextModal(resp) {
  const embed = resp.mode === "embed";
  const max = LIMITS.respText[resp.mode] ?? LIMITS.respText.text;
  const fields = [];
  if (embed) {
    fields.push(
      textLabel({
        id: "title",
        label: "Título da embed",
        description: "Opcional.",
        max: LIMITS.respTitle,
        value: resp.title,
        placeholder: "Ex.: Bem-vindo!",
      })
    );
  }
  fields.push(
    textLabel({
      id: "text",
      label: embed ? "Descrição da embed" : "Texto da resposta",
      description:
        resp.mode === "v2" ? "Markdown aceito. Use [separador] ou [separador_largo] para dividir." : "Markdown aceito.",
      style: TextInputStyle.Paragraph,
      max,
      value: resp.text,
      placeholder: "Escreva a resposta",
    })
  );
  if (embed) {
    fields.push(
      textLabel({
        id: "footer",
        label: "Rodapé da embed",
        description: "Opcional.",
        max: LIMITS.respFooter,
        value: resp.footer,
      })
    );
  }
  return modal("msg:modal:rtext", embed ? "Título e texto da resposta" : "Texto da resposta", ...fields);
}

// Botão de link dentro da resposta. index: número do botão ou "new"
function buildResponseButtonModal(index, data) {
  return modal(
    `msg:modal:rbtn:${index}`,
    index === "new" ? "Novo botão da resposta" : `Botão ${Number(index) + 1} da resposta`,
    textLabel({
      id: "label",
      label: "Texto do botão",
      description: "Opcional quando houver emoji.",
      max: 80,
      value: data?.label,
      placeholder: "Ex.: Abrir site",
    }),
    textLabel({
      id: "url",
      label: "Link",
      description: "Obrigatório. Começa com https://",
      max: 500,
      required: true,
      value: data?.url,
      placeholder: "https://exemplo.com",
    }),
    textLabel({
      id: "emoji",
      label: "Emoji (opcional)",
      description: "Emoji do servidor no formato <:nome:id>, ou vazio.",
      max: 60,
      value: data?.emoji,
    })
  );
}

module.exports = {
  buildTextModal,
  buildImageModal,
  buildHexModal,
  buildButtonModal,
  buildAudioModal,
  buildResponseTextModal,
  buildResponseButtonModal,
};
