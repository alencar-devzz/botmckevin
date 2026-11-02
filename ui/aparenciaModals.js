const { TextInputStyle } = require("discord.js");
const { textLabel, selectLabel, uploadLabel, modal } = require("./modalHelpers");
const { ACTIVITY_TYPES } = require("../utils/botPresence");

// Avatar / banner: upload de imagem OU link
function buildImageModal(kind) {
  const title = kind === "avatar" ? "Avatar do bot" : "Banner do bot";
  return modal(
    `apar_modal_${kind}`,
    title,
    uploadLabel({
      id: "file",
      label: "Enviar imagem",
      description: "Escolha uma imagem da sua galeria (png, jpg, gif ou webp).",
    }),
    textLabel({
      id: "link",
      label: "Ou envie o link de uma imagem",
      description: "Use só se não enviou um arquivo acima.",
      max: 500,
      placeholder: "https://exemplo.com/imagem.png",
    })
  );
}

function buildPrefixoModal(current) {
  return modal(
    "apar_modal_prefixo",
    "Prefixo do bot",
    textLabel({
      id: "prefixo",
      label: "Novo prefixo",
      description: "Até 5 caracteres, sem espaços.",
      max: 5,
      required: true,
      value: current,
      placeholder: "Ex: n!",
    })
  );
}

function buildNomeModal(current) {
  return modal(
    "apar_modal_nome",
    "Nome do bot",
    textLabel({
      id: "nome",
      label: "Novo nome do bot",
      description: "Entre 2 e 32 caracteres.",
      max: 32,
      required: true,
      value: current,
    })
  );
}

// Select com todos os tipos de status (RPC)
function buildStatusTipoModal(current) {
  const options = [
    {
      label: "Nenhum",
      description: "O bot fica sem status de atividade.",
      value: "none",
      default: current === "none" || !current,
    },
    ...Object.entries(ACTIVITY_TYPES).map(([value, info]) => ({
      label: info.label,
      description: info.hint.slice(0, 100),
      value,
      default: value === current,
    })),
  ];

  return modal(
    "apar_modal_status_tipo",
    "Status do bot",
    selectLabel({
      id: "tipo",
      label: "Tipo de status",
      description: "Escolha como o bot vai aparecer.",
      options,
    })
  );
}

// Texto do status (muda conforme o tipo escolhido)
function buildStatusTextoModal(cfg) {
  const kind = cfg.presenceActivity;
  const info = ACTIVITY_TYPES[kind];

  if (kind === "custom") {
    return modal(
      "apar_modal_status_texto",
      "Status personalizado",
      textLabel({
        id: "state",
        label: info.textLabel,
        max: 128,
        required: true,
        value: cfg.presenceState,
        placeholder: "Ex: Use n!ajuda",
      })
    );
  }

  const labels = [
    textLabel({
      id: "name",
      label: info.textLabel,
      max: 128,
      required: true,
      value: cfg.presenceName,
      placeholder: "Ex: Prefixo n!",
    }),
  ];

  if (kind === "streaming") {
    labels.push(
      textLabel({
        id: "url",
        label: "Link da transmissão",
        description: "Precisa ser do Twitch ou do YouTube.",
        max: 200,
        required: true,
        value: cfg.presenceUrl,
        placeholder: "https://twitch.tv/seucanal",
      })
    );
  }

  labels.push(
    textLabel({
      id: "state",
      label: "Linha extra (opcional)",
      description: "Segunda linha de texto abaixo do status.",
      style: TextInputStyle.Short,
      max: 128,
      value: cfg.presenceState,
    })
  );

  return modal("apar_modal_status_texto", info.label, ...labels);
}

module.exports = {
  buildImageModal,
  buildPrefixoModal,
  buildNomeModal,
  buildStatusTipoModal,
  buildStatusTextoModal,
};
