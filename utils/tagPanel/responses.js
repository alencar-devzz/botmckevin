const { MessageFlags } = require("discord.js");
const { RESPONSE_MODES, normalizeResponse } = require("../msgBuilder/store");
const { buildResponse } = require("../msgBuilder/response");

// Respostas do botão do painel de tag. Cada situação tem a sua e a staff personaliza tudo no editor
// (etapa Respostas): formato (texto, embed ou container), cor, separador, imagem, miniatura e links.
// Sem personalização, vale o padrão daqui. Dentro dos textos, {variáveis} são trocadas na hora.

const EPHEMERAL = MessageFlags.Ephemeral;

// Só estes formatos aparecem no editor ("none" do Criador de mensagens não faz sentido aqui)
const MODES = Object.fromEntries(Object.entries(RESPONSE_MODES).filter(([key]) => key !== "none"));

const COMMON = ["usuario", "servidor"];

const KINDS = {
  ok: {
    label: "Sucesso",
    desc: "Tag encontrada e cargos entregues",
    vars: [...COMMON, "cargos", "erros"],
    color: "verde",
  },
  fail: {
    label: "Falha",
    desc: "O perfil não usa a tag do servidor",
    vars: [...COMMON, "detalhes"],
    color: "vermelho",
  },
  already: {
    label: "Já verificado",
    desc: "Já tem os cargos do painel",
    vars: [...COMMON, "cargos"],
    color: "blurple",
  },
  norole: {
    label: "Sem cargo definido",
    desc: "O painel não tem cargo para entregar",
    vars: COMMON,
    color: "amarelo",
  },
};

const VAR_HELP = {
  usuario: "menção de quem clicou",
  servidor: "nome do servidor",
  cargos: "cargos do painel",
  erros: "aviso de cargo que falhou",
  detalhes: "o que faltou",
};

// ---------- padrão ----------

function defaultText(panel, kind) {
  switch (kind) {
    case "ok":
      return "### Cargo entregue\n[separador]\nTag do servidor encontrada no seu perfil!\n\n**Cargos recebidos:** {cargos}";
    case "fail":
      return "### Tag não encontrada\n[separador]\nSeu perfil não está usando a tag deste servidor. Ative a tag do servidor no perfil e clique de novo.\n{detalhes}";
    case "already":
      return "### Você já tem o cargo\n[separador]\nVocê já recebeu os cargos deste painel.";
    default:
      return "### Painel sem cargo\n[separador]\nEste painel não tem nenhum cargo definido para entregar. Avise a staff para configurar o cargo.";
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
      detalhes: "-# Tag do servidor não encontrada no seu perfil.",
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
