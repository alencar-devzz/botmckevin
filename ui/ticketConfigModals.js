const { TextInputStyle, LabelBuilder, FileUploadBuilder } = require("discord.js");
const {
  MAX_IMAGES,
  DEFAULTS,
  BUTTON_STYLES,
  COLOR_PRESETS,
  ARCHIVE_OPTIONS,
  colorToHex,
} = require("../utils/ticketSettings");
const { clip, textLabel, selectLabel, modal } = require("./modalHelpers");

// ---------- novo painel / renomear ----------

function buildNewPanelModal() {
  return modal(
    "tcfg_modal_new",
    "Novo painel de tickets",
    textLabel({
      id: "name",
      label: "Nome do painel",
      description: "Só você e a equipe veem esse nome.",
      max: 50,
      required: true,
      placeholder: "Ex: Atendimento geral",
    }),
    selectLabel({
      id: "mode",
      label: "Como o ticket será aberto?",
      description: "Você pode mudar isso depois.",
      options: [
        {
          label: "Select menu com opções",
          description: "O membro escolhe uma categoria na lista.",
          value: "select",
          default: true,
        },
        {
          label: "Botão",
          description: "Um clique abre o ticket.",
          value: "button",
        },
      ],
    })
  );
}

function buildRenameModal(panel) {
  return modal(
    `tcfg_modal_x_rename:${panel.id}`,
    "Renomear painel",
    textLabel({
      id: "name",
      label: "Nome do painel",
      max: 50,
      required: true,
      value: panel.name,
    })
  );
}

// ---------- aparência ----------

function buildAppearanceTextModal(panel) {
  return modal(
    `tcfg_modal_a_text:${panel.id}`,
    "Textos do painel",
    textLabel({
      id: "title",
      label: "Título (opcional)",
      max: 100,
      value: panel.title,
      placeholder: "Ex: Central de atendimento",
    }),
    textLabel({
      id: "description",
      label: "Descrição (opcional)",
      style: TextInputStyle.Paragraph,
      max: 1000,
      value: panel.description,
      placeholder: "Ex: Selecione abaixo o motivo do seu contato.",
    }),
    textLabel({
      id: "footer",
      label: "Rodapé (opcional)",
      description: "Texto pequeno no fim do painel.",
      max: 200,
      value: panel.footer,
      placeholder: "Ex: Atendimento todos os dias, das 10h às 22h",
    })
  );
}

function buildColorModal(panel) {
  const current = Object.entries(COLOR_PRESETS).find(([, c]) => c.value === panel.color)?.[0];
  return modal(
    `tcfg_modal_a_color:${panel.id}`,
    "Cor do painel",
    selectLabel({
      id: "preset",
      label: "Cor predefinida",
      description: "Cor da barra lateral do painel.",
      options: Object.entries(COLOR_PRESETS).map(([value, c]) => ({
        label: c.label,
        value,
        default: value === (current ?? (panel.color == null ? "none" : null)),
      })),
    }),
    textLabel({
      id: "hex",
      label: "Cor personalizada (opcional)",
      description: "Se preencher, vale no lugar da predefinida.",
      max: 7,
      value: current ? null : colorToHex(panel.color),
      placeholder: "#00c853",
    })
  );
}

// ---------- imagens: upload + manter/remover + links ----------
// current = [{ label, description }] das imagens atuais (vazio = sem select)

function buildImagesModal({ customId, title, current = [] }) {
  const labels = [];

  if (current.length) {
    labels.push(
      selectLabel({
        id: "keep",
        label: "Imagens atuais",
        description: "Marcadas = mantidas. Desmarque para remover.",
        min: 0,
        max: Math.min(current.length, 25),
        required: false,
        options: current.slice(0, 25).map((item, index) => ({
          label: clip(item.label, 100),
          description: clip(item.description, 100),
          value: String(index),
          default: true,
        })),
      })
    );
  }

  const upload = new FileUploadBuilder()
    .setCustomId("upload")
    .setMinValues(0)
    .setMaxValues(MAX_IMAGES)
    .setRequired(false);

  labels.push(
    new LabelBuilder()
      .setLabel("Enviar imagens")
      .setDescription(`Até ${MAX_IMAGES} no total (png, jpg, gif ou webp, máx. 4 MB cada).`)
      .setFileUploadComponent(upload)
  );

  labels.push(
    textLabel({
      id: "links",
      label: "Links de imagens (opcional)",
      description: "Um link por linha. Somam com as imagens acima.",
      style: TextInputStyle.Paragraph,
      max: 1500,
      placeholder: "https://exemplo.com/imagem.png",
    })
  );

  return modal(customId, title, ...labels);
}

// ---------- abertura ----------

function buildModeModal(panel) {
  return modal(
    `tcfg_modal_m_mode:${panel.id}`,
    "Tipo de abertura",
    selectLabel({
      id: "mode",
      label: "Como o ticket será aberto?",
      description: "No modo botão, só a primeira opção é usada.",
      options: [
        {
          label: "Select menu com opções",
          description: "O membro escolhe uma categoria na lista.",
          value: "select",
          default: panel.mode === "select",
        },
        {
          label: "Botão",
          description: "Um clique abre o ticket.",
          value: "button",
          default: panel.mode === "button",
        },
      ],
    })
  );
}

function buildButtonModal(panel) {
  return modal(
    `tcfg_modal_m_btn:${panel.id}`,
    "Botão de abertura",
    textLabel({
      id: "label",
      label: "Texto do botão",
      max: 80,
      required: true,
      value: panel.buttonLabel,
      placeholder: DEFAULTS.buttonLabel,
    }),
    selectLabel({
      id: "style",
      label: "Cor do botão",
      options: Object.entries(BUTTON_STYLES).map(([value, label]) => ({
        label,
        value,
        default: value === panel.buttonStyle,
      })),
    })
  );
}

function buildPlaceholderModal(panel) {
  return modal(
    `tcfg_modal_m_ph:${panel.id}`,
    "Texto do select menu",
    textLabel({
      id: "placeholder",
      label: "Texto do select menu",
      description: "Deixe vazio para usar o padrão.",
      max: 100,
      value: panel.placeholder === DEFAULTS.placeholder ? null : panel.placeholder,
      placeholder: DEFAULTS.placeholder,
    })
  );
}

// ---------- ticket interno ----------

function buildInternalTextModal(panel) {
  return modal(
    `tcfg_modal_i_text:${panel.id}`,
    "Textos do ticket interno",
    textLabel({
      id: "heading",
      label: "Título",
      description: "Deixe vazio para usar o padrão. Variáveis: {username} {user} {option} {server} {number}",
      max: 100,
      value: panel.internalHeading === DEFAULTS.internalHeading ? null : panel.internalHeading,
      placeholder: DEFAULTS.internalHeading,
    }),
    textLabel({
      id: "message",
      label: "Mensagem dentro do ticket",
      description: "Deixe vazio para usar o padrão.",
      style: TextInputStyle.Paragraph,
      max: 1000,
      value: panel.internalMessage === DEFAULTS.internalMessage ? null : panel.internalMessage,
      placeholder: DEFAULTS.internalMessage,
    }),
    textLabel({
      id: "claimed",
      label: "Aviso ao assumir",
      description: "Variáveis: {staff} {user} {server}",
      style: TextInputStyle.Paragraph,
      max: 300,
      value: panel.claimedMessage === DEFAULTS.claimedMessage ? null : panel.claimedMessage,
      placeholder: DEFAULTS.claimedMessage,
    }),
    textLabel({
      id: "thread",
      label: "Nome do tópico",
      description: "Variáveis: {username} {number} {option} {server}",
      max: 100,
      value: panel.threadName === DEFAULTS.threadName ? null : panel.threadName,
      placeholder: DEFAULTS.threadName,
    })
  );
}

function buildArchiveModal(panel) {
  return modal(
    `tcfg_modal_i_arch:${panel.id}`,
    "Arquivamento automático",
    selectLabel({
      id: "minutes",
      label: "Arquivar o tópico após inatividade",
      description: "Tempo sem mensagens até o Discord arquivar o ticket.",
      options: Object.entries(ARCHIVE_OPTIONS).map(([value, label]) => ({
        label,
        value,
        default: Number(value) === panel.archiveMinutes,
      })),
    })
  );
}

// ---------- regras ----------

function buildLimitModal(panel) {
  return modal(
    `tcfg_modal_g_limit:${panel.id}`,
    "Limite de tickets por pessoa",
    textLabel({
      id: "limit",
      label: "Tickets abertos ao mesmo tempo",
      description: "Use 0 para não limitar. Máximo: 10.",
      max: 2,
      required: true,
      value: String(panel.maxPerUser),
      placeholder: "1",
    })
  );
}

// ---------- opções do menu (com select de posição) ----------
// simple = modo botão (sem descrição nem posição)

function buildOptionModal({ customId, title, option = {}, options = [], position = 0, simple = false }) {
  const labels = [
    textLabel({
      id: "label",
      label: simple ? "Nome do ticket" : "Nome da opção",
      max: 100,
      required: true,
      value: option.label,
      placeholder: "Ex: Suporte",
    }),
  ];

  if (!simple) {
    labels.push(
      textLabel({
        id: "description",
        label: "Descrição no menu (opcional)",
        max: 100,
        value: option.description,
        placeholder: "Ex: Tire dúvidas ou peça ajuda da equipe",
      })
    );
  }

  labels.push(
    textLabel({
      id: "title",
      label: "Título no ticket",
      description: "Deixe vazio para usar o nome em maiúsculas.",
      max: 100,
      value: option.title,
      placeholder: "Ex: SUPORTE",
    }),
    textLabel({
      id: "message",
      label: "Mensagem própria no ticket (opcional)",
      description: "Vazio = usa a mensagem padrão do ticket interno.",
      style: TextInputStyle.Paragraph,
      max: 1000,
      value: option.message,
    })
  );

  if (!simple) {
    const isEdit = Boolean(option.key);
    const total = isEdit ? options.length : options.length + 1;
    const positions = Array.from({ length: Math.max(1, Math.min(total, 25)) }, (_, i) => {
      const occupant = options[i];
      let description = "Última posição";
      if (occupant) description = occupant.key === option.key ? "Posição atual" : `Hoje: ${occupant.label}`;
      return {
        label: `Posição ${i + 1}`,
        description: clip(description, 100),
        value: String(i),
        default: i === position,
      };
    });

    labels.push(
      selectLabel({
        id: "position",
        label: "Posição no menu",
        description: "Onde esta opção aparece na lista do painel.",
        options: positions,
      })
    );
  }

  return modal(customId, title, ...labels);
}

// ---------- remover várias opções ----------

function buildRemoveOptionsModal(panel) {
  return modal(
    `tcfg_modal_o_rm:${panel.id}`,
    "Remover opções",
    selectLabel({
      id: "remove",
      label: "Opções para remover",
      description: "O painel precisa manter pelo menos uma opção.",
      min: 1,
      max: Math.max(1, Math.min(panel.options.length - 1, 25)),
      placeholder: "Selecione as opções",
      options: panel.options.slice(0, 25).map((o) => {
        const item = { label: clip(o.label, 100), value: o.key };
        if (o.description) item.description = clip(o.description, 100);
        return item;
      }),
    })
  );
}

// ---------- pergunta ao abrir o ticket (usada pelo painel público) ----------

function buildReasonModal(panelId, optionKey) {
  return modal(
    `ticket_reason:${panelId}:${optionKey}`,
    "Abrir ticket",
    textLabel({
      id: "reason",
      label: "Qual o motivo do ticket?",
      description: "Isso ajuda a equipe a atender você mais rápido.",
      style: TextInputStyle.Paragraph,
      max: 500,
      required: true,
      placeholder: "Descreva o que você precisa",
    })
  );
}

module.exports = {
  buildNewPanelModal,
  buildRenameModal,
  buildAppearanceTextModal,
  buildColorModal,
  buildImagesModal,
  buildModeModal,
  buildButtonModal,
  buildPlaceholderModal,
  buildInternalTextModal,
  buildArchiveModal,
  buildLimitModal,
  buildOptionModal,
  buildRemoveOptionsModal,
  buildReasonModal,
};
