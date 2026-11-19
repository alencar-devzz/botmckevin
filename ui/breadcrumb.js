// ---------------------------------------------------------------------------
// SUBTÍTULO "Painel › Opção" E BOTÃO VOLTAR FORA DO CONTAINER (tudo do /menu)
//
// Duas coisas são feitas aqui, para TODAS as telas do /menu de uma vez:
//   1. Logo abaixo do título entra o caminho da tela:  Painel › Moderação › **Sistema de tickets**
//   2. O botão "Voltar" sai de dentro do container e fica numa linha própria, embaixo dele
//      (igual ao botão Buscar do menu principal).
//
// Quem chama isso é utils/menuDecorator.js (instalado no events/interactionCreate.js), que passa
// por aqui toda tela enviada em resposta a um botão, select ou modal do /menu.
// Uma tela só é considerada do /menu se tiver algum componente com id de um sistema da lista ROOTS.
// Sistema novo no /menu? Inclua uma linha em ROOTS e pronto.
// ---------------------------------------------------------------------------

const TYPE = { ActionRow: 1, Button: 2, Section: 9, TextDisplay: 10, Separator: 14, Container: 17 };

const COMUNIDADE = "Comunidade";
const MODERACAO = "Moderação";

// prefix/exact = id dos componentes da tela · trail = caminho depois de "Painel" (nomes curtos, só o essencial)
// home = nomes completos que o título da tela inicial do sistema pode ter (para não repetir no caminho)
const ROOTS = [
  { prefix: "apar_", trail: ["Aparência"], home: ["Aparência e prefixo", "Aparência do bot"] },
  { prefix: "port_", trail: [COMUNIDADE, "Portaria"] },
  { prefix: "autoroles_", trail: [COMUNIDADE, "Auto-roles"] },
  { prefix: "pcfg_", trail: [COMUNIDADE, "Posts"], home: ["Posts e Instagram"] },
  { prefix: "chcfg_", trail: [COMUNIDADE, "Calls"], home: ["Gerenciador de calls"] },
  { prefix: "clcfg_", trail: [COMUNIDADE, "cl"], home: ["Comando cl"] },
  { prefix: "sptcfg_", trail: [COMUNIDADE, "Spotify"], home: ["Comando spotify"] },
  { prefix: "invcfg_", trail: [COMUNIDADE, "Convites"] },
  { prefix: "tcfg_", trail: [MODERACAO, "Tickets"], home: ["Sistema de tickets"] },
  { prefix: "logs_", trail: [MODERACAO, "Logs"], home: ["Logs e registros"] },
  { prefix: "rmcfg_", trail: [MODERACAO, "Cargos"], home: ["Gerenciamento de cargos"] },
  { prefix: "nukecfg_", trail: [MODERACAO, "nnuke"], home: ["Comando nnuke"] },
  { prefix: "bumpcfg_", trail: [MODERACAO, "Bump"], home: ["Bump reminder"] },
  // Criador de mensagens aberto pelo /menu (só ele tem a linha de navegação msg:hist:*)
  { prefix: "msg:hist:", trail: ["Outros", "Criador de mensagens"], home: ["Criador de mensagens"] },
  { prefix: "cat:comunidade:", trail: [COMUNIDADE], home: ["Comunidade e interação"] },
  { prefix: "cat:moderacao:", trail: [MODERACAO] },
];

const MAX_CRUMB = 45;

// ---------- texto ----------

// Remove emoji customizado, menções e símbolos de formatação (o subtítulo é só texto simples)
function cleanTitle(value) {
  const s = String(value ?? "")
    .replace(/<a?:\w+:\d+>/g, "")
    .replace(/<[@#&!][^>]*>/g, "")
    .replace(/[*_~`|>›\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > MAX_CRUMB ? `${s.slice(0, MAX_CRUMB - 1)}…` : s;
}

// Escapa o que o staff digitou na busca para não bagunçar a formatação
const escapeMd = (value) => String(value ?? "").replace(/([\\*_~`|>])/g, "\\$1").replace(/\s+/g, " ").trim();

const norm = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

// trail = [] -> "Painel" · ["Moderação"] -> "Painel › **Moderação**" · só o último fica em negrito
function crumbLine(trail = []) {
  const list = trail.filter(Boolean);
  if (!list.length) return "-# **Painel**";
  const head = list.slice(0, -1).map((t) => `${t} › `).join("");
  return `-# Painel › ${head}**${list[list.length - 1]}**`;
}

// Tela de resultados da busca: Painel › **Buscar** ticket
function searchCrumbLine(query) {
  return `-# Painel › **Buscar** ${escapeMd(query).slice(0, 60)}`;
}

const CRUMB_MARK = /(^|\n)-# (\*\*Painel\*\*|Painel › )/;

// ---------- detecção do sistema ----------

function collectCustomIds(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (typeof node.custom_id === "string") out.push(node.custom_id);
  if (Array.isArray(node.components)) node.components.forEach((c) => collectCustomIds(c, out));
  if (node.accessory) collectCustomIds(node.accessory, out);
  return out;
}

// Resolve o primeiro sistema (ROOTS) que aparece nos ids da tela
function detectRoot(components) {
  const ids = collectCustomIds({ components });
  for (const id of ids) {
    const root = ROOTS.find((r) => (r.exact ? id === r.exact : id.startsWith(r.prefix)));
    if (root) return root;
  }
  return null;
}

// ---------- montagem ----------

// Primeiro TextDisplay do container (direto ou dentro da primeira seção): é o título da tela
function findTitleDisplay(container) {
  for (const child of container.components ?? []) {
    if (child.type === TYPE.TextDisplay) return child;
    if (child.type === TYPE.Section) {
      const first = (child.components ?? []).find((c) => c.type === TYPE.TextDisplay);
      if (first) return first;
    }
  }
  return null;
}

function addCrumb(container, root) {
  const display = findTitleDisplay(container);
  if (!display || typeof display.content !== "string") return;
  if (CRUMB_MARK.test(display.content)) return; // já tem o subtítulo

  const match = display.content.match(/^(#{1,3}[ \t]+[^\n]*)/);
  if (!match) return; // primeira linha não é um título

  const trail = [...root.trail];
  const title = cleanTitle(match[1].replace(/^#{1,3}[ \t]+/, ""));
  const known = [trail[trail.length - 1], ...(root.home ?? [])].map(norm);
  if (title && !known.includes(norm(title))) trail.push(title);

  const rest = display.content.slice(match[1].length).replace(/^\n/, "");
  display.content = `${match[1]}\n${crumbLine(trail)}${rest ? `\n${rest}` : ""}`;
}

const isBack = (c) => c?.type === TYPE.Button && c.label === "Voltar" && typeof c.custom_id === "string";

// Tira o "Voltar" de dentro do container e devolve o botão (ou null)
function extractBack(containers) {
  const found = [];
  for (const container of containers) {
    for (const child of container.components ?? []) {
      if (child.type !== TYPE.ActionRow) continue;
      for (const button of child.components ?? []) if (isBack(button)) found.push({ container, row: child, button });
    }
  }
  if (!found.length) return null;

  const chosen = found[found.length - 1]; // o de baixo é o botão de navegação da tela
  for (const hit of found) {
    if (hit.button.custom_id !== chosen.button.custom_id) continue;
    hit.row.components = hit.row.components.filter((b) => b !== hit.button);
    if (!hit.row.components.length) {
      hit.container.components = hit.container.components.filter((c) => c !== hit.row);
    }
  }

  // Sobrou separador pendurado no fim do container? Tira.
  for (const container of containers) {
    const list = container.components ?? [];
    while (list.length && list[list.length - 1].type === TYPE.Separator) list.pop();
  }
  return chosen.button;
}

// Recebe os components de uma resposta (builders ou JSON) e devolve a versão final.
// Telas que não são do /menu voltam exatamente como entraram.
function decorateComponents(components) {
  if (!Array.isArray(components) || !components.length) return components;

  const json = components.map((c) => (typeof c?.toJSON === "function" ? c.toJSON() : c));
  if (!json.some((c) => c?.type === TYPE.Container)) return components;

  const root = detectRoot(json);
  if (!root) return components;

  const copy = structuredClone(json);
  const containers = copy.filter((c) => c.type === TYPE.Container);

  addCrumb(containers[0], root);

  const back = extractBack(containers);
  const result = copy.filter((c) => c.type !== TYPE.Container || (c.components ?? []).length > 0);
  if (back) result.push({ type: TYPE.ActionRow, components: [back] });
  return result;
}

module.exports = { crumbLine, searchCrumbLine, decorateComponents, ROOTS, detectRoot };
