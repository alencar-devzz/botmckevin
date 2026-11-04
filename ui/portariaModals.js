const { TextInputStyle } = require("discord.js");
const { textLabel, modal } = require("./modalHelpers");
const { VARIABLES } = require("../utils/formatMessage");

const variablesHint = VARIABLES.map(([key]) => key).join(" ");

const TITLES = {
  welcome: "Mensagem de boas-vindas",
  leave: "Mensagem de saída",
  dm: "Mensagem da DM",
};

const EXAMPLES = {
  welcome: "Ex: Seja bem-vindo(a), {user}!",
  leave: "Ex: {username} saiu do servidor.",
  dm: "Ex: Olá! Leia as regras do {server} antes de começar.",
};

// kind: "welcome" | "leave" | "dm"
function buildMessageModal(kind, current) {
  return modal(
    `port_modal:msg:${kind}`,
    TITLES[kind],
    textLabel({
      id: "message",
      label: "Mensagem",
      description: `Variáveis: ${variablesHint}`.slice(0, 100),
      style: TextInputStyle.Paragraph,
      max: 1500,
      value: current,
      placeholder: EXAMPLES[kind],
    })
  );
}

function buildDelayModal(kind, current) {
  return modal(
    `port_modal:delay:${kind}`,
    "Apagar mensagem automaticamente",
    textLabel({
      id: "seconds",
      label: "Segundos até apagar",
      description: "Use 0 para não apagar. Máximo de 3600 (1 hora).",
      max: 4,
      required: true,
      value: String(current ?? 0),
      placeholder: "Ex: 30",
    })
  );
}

function buildAgeModal(current) {
  return modal(
    "port_modal:age",
    "Idade mínima da conta",
    textLabel({
      id: "days",
      label: "Dias de criação da conta",
      description: "Contas mais novas que isso serão expulsas. De 1 a 365.",
      max: 3,
      required: true,
      value: String(current ?? 7),
      placeholder: "Ex: 7",
    })
  );
}

module.exports = { buildMessageModal, buildDelayModal, buildAgeModal };
