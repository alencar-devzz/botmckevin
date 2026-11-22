const { MessageFlags } = require("discord.js");
const { RESPONSE_MODES, normalizeResponse } = require("../msgBuilder/store");
const { buildResponse } = require("../msgBuilder/response");

// Respostas do botão Verificar. Cada situação tem a sua e a staff personaliza tudo no editor
// (etapa Respostas): formato (texto, embed ou container), cor, separador, imagem, miniatura e links.
// Sem personalização, vale o padrão daqui. Dentro dos textos, {variáveis} são trocadas na hora.

const EPHEMERAL = MessageFlags.Ephemeral;

// Só estes formatos aparecem no editor ("none" do Criador de mensagens não faz sentido aqui)
const MODES = Object.fromEntries(Object.entries(RESPONSE_MODES).filter(([key]) => key !== "none"));

const COMMON = ["usuario", "servidor"];

const KINDS = {
  ok: {
    label: "Sucesso",
    desc: "Perfil verificado e cargos entregues",
    vars: [...COMMON, "cargos", "erros"],
    color: "verde",
  },
  fail: {
    label: "Falha",
    desc: "Perfil sem o padrão exigido",
    vars: [...COMMON, "detalhes"],
    color: "vermelho",
  },
  already: {
    label: "Já verificado",
    desc: "Já verificou e ainda tem os cargos",
    vars: [...COMMON, "cargos"],
    color: "blurple",
  },
  restored: {
    label: "Cargo devolvido",
    desc: "Já verificou, perdeu o cargo e o bot devolveu",
    vars: [...COMMON, "cargos", "erros"],
    color: "verde",
  },
  norole: {
    label: "Sem cargo definido",
    desc: "O painel não tem cargo para entregar",
    vars: COMMON,
    color: "amarelo",
  },
  notoken: {
    label: "Sem token",
    desc: "A staff ainda não definiu a token",
    vars: COMMON,
    color: "amarelo",
  },
  private: {
    label: "Perfil privado",
    desc: "O perfil do membro não pôde ser lido",
    vars: COMMON,
    color: "amarelo",
  },
  noprofile: {
    label: "Erro ao ler perfil",
    desc: "Falha passageira ao ler o perfil",
    vars: COMMON,
    color: "vermelho",
  },
};

const VAR_HELP = {
  usuario: "menção de quem clicou",
  servidor: "nome do servidor",
  cargos: "cargos do painel",
  erros: "aviso de cargo que falhou",
  detalhes: "o que faltou no perfil",
};

// ---------- padrão ----------

function defaultText(panel, kind) {
  const okText = String(panel?.successText ?? "").trim() || "Perfil verificado com sucesso!";
  const failText = String(panel?.failText ?? "").trim() || "Seu perfil não contém o padrão exigido.";
  switch (kind) {
    case "ok":
      return `### Perfil verificado\n[separador]\n${okText}\n\n**Cargos recebidos:** {cargos}`;
    case "fail":
      return `### Verificação recusada\n[separador]\n${failText}\n{detalhes}`;
    case "already":
      return "### Já verificado\n[separador]\nVocê já se verificou neste painel.";
    case "restored":
      return "### Cargo devolvido\n[separador]\nVocê já estava verificado, mas estava sem o cargo. Devolvi: {cargos}";
    case "norole":
      return "### Painel sem cargo\n[separador]\nEste painel não tem nenhum cargo definido para entregar. Avise a staff para configurar o cargo.";
    case "private":
      return "### Perfil privado\n[separador]\nNão consegui ler o seu perfil porque ele está privado ou restrito. Deixe seu perfil visível, ou ative o que for exigido (status, tag), e tente de novo.";
    case "notoken":
      return "### Verificação indisponível\n[separador]\nO administrador ainda não definiu a token de acesso. A verificação está indisponível.";
    default:
      return "### Não consegui ler seu perfil\n[separador]\nTente de novo em instantes; se continuar, avise a staff.";
  }
}

const defaultResponse = (panel, kind) =>
  normalizeResponse({ mode: "v2", text: defaultText(panel, kind), color: KINDS[kind].color, hidden: true });

// Resposta em uso (personalizada ou padrão), ainda com as {variáveis}
function getResponse(panel, kind) {
  const saved = panel?.responses?.[kind];
  if (saved && saved.mode in MODES) return normalizeResponse(saved);
  return defaultResponse(panel, kind);
}

const isCustom = (panel, kind) => Boolean(panel?.responses?.[kind]);

// ---------- variáveis ----------

const fill = (value, vars) => String(value ?? "").replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));

// Troca as variáveis. Se houver aviso de erro e o texto não usa {erros}, o aviso entra no fim.
function fillResponse(resp, vars) {
  let text = resp.text;
  if (vars.erros && !/\{erros\}/.test(text)) text = `${text}\n{erros}`;
  return {
    ...resp,
    text: fill(text, vars),
    title: fill(resp.title, vars),
    footer: fill(resp.footer, vars),
  };
}

const mentions = (ids) => (ids?.length ? ids.map((id) => `<@&${id}>`).join(", ") : "nenhum");

// Monta a mensagem pronta para enviar (efêmera, sem marcar ninguém)
async function renderKind(panel, kind, vars) {
  const resp = fillResponse(getResponse(panel, kind), vars);
  const { payload } = await buildResponse(resp);
  // Resposta vazia ou com imagem perdida: usa o texto padrão para quem clicou nunca ficar sem resposta
  const final = payload ?? (await buildResponse(fillResponse(defaultResponse(panel, kind), vars))).payload ?? { content: "Pronto." };
  return { ...final, flags: (final.flags ?? 0) | EPHEMERAL, allowedMentions: { parse: [] } };
}

function baseVars(interaction, extra = {}) {
  return {
    usuario: `<@${interaction.user.id}>`,
    servidor: interaction.guild?.name ?? "",
    cargos: "",
    erros: "",
    detalhes: "",
    ...extra,
  };
}

// Responde ao clique de Verificar (a interação já foi confirmada com deferReply)
async function answer(interaction, panel, kind, extra = {}) {
  const payload = await renderKind(panel, kind, baseVars(interaction, extra));
  return interaction.editReply(payload);
}

// Prévia no editor, com dados de exemplo
async function preview(interaction, panel, kind) {
  const gives = (panel.giveRoles ?? []).filter((id) => interaction.guild.roles.cache.has(id));
  const payload = await renderKind(
    panel,
    kind,
    baseVars(interaction, {
      cargos: gives.length ? mentions(gives) : "`cargo de exemplo`",
      detalhes: "-# A bio não contém o padrão exigido.",
      erros: "",
    })
  );
  return interaction.reply(payload);
}

module.exports = {
  KINDS,
  MODES,
  VAR_HELP,
  getResponse,
  defaultResponse,
  isCustom,
  fillResponse,
  mentions,
  answer,
  preview,
};
