// Valores padrão do sistema "Gerenciamento de cargos" (comando groles).
// Tudo aqui pode ser alterado depois pelo menu: Moderação → Gerenciamento de cargos.
// Estes valores só valem enquanto o servidor não editou a regra / o texto correspondente.

const CEO = "1542321888355684456"; // gerencia TODOS os cargos
const R453 = "1542321888355684453";
const R211 = "1542321888309809211";
const R454 = "1542321888355684454";
const R212 = "1542321888309809212";
const R210 = "1542321888309809210"; // @mod

// Cada regra: o cargo "managerId" pode gerenciar TODOS os cargos, menos os de "blocked".
const DEFAULT_RULES = [
  { managerId: CEO, blocked: [] },
  { managerId: R453, blocked: [CEO] },
  { managerId: R211, blocked: [CEO] },
  { managerId: R454, blocked: [CEO] },
  { managerId: R212, blocked: [CEO, R211, R453, R454] },
  { managerId: R210, blocked: [CEO, R211, R453, R454] },
];

// Variáveis aceitas nos textos: {executor} {target} {role} {server}
const DEFAULT_TEXTS = {
  title: "Gerenciamento de Cargos",
  descSelf: "lae {executor}, você está gerenciando seus próprios **cargos**.",
  descOther: "lae {executor}, você está gerenciando os **cargos** de {target}.",
  descRole: "lae {executor}, você está gerenciando o cargo {role}.",
  placeholder: "Selecione quem você quer gerenciar",
  footer: "",
  emptyList: "Nenhum cargo para mostrar aqui.",
  remove: "Remover",
  add: "Adicionar",
  noPerm: "Sem permissão",
  noBot: "Acima do bot",
  removable: "Removíveis",
  addable: "Adicionáveis",
  search: "Buscar",
  back: "Voltar",
  next: "Avançar",
  holders: "Ver quem tem",
  detail: "Ver cargo",
};

const TEXT_KEYS = Object.keys(DEFAULT_TEXTS);

module.exports = { DEFAULT_RULES, DEFAULT_TEXTS, TEXT_KEYS, CEO };
