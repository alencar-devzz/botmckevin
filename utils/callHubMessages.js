// Catálogo de TODAS as mensagens do painel da call (respostas, avisos, seletores, janelas).
// Tudo aqui pode ser editado em n!menu → Comunidade e interação → Gerenciador de calls → Painel da call
// → Mensagens e respostas. Texto vazio/igual ao padrão = volta ao padrão.
//
// Variáveis entre chaves, como {pessoas}, são trocadas na hora de enviar. `vars` lista as aceitas.

const GROUPS = [
  {
    id: "visual",
    title: "Visual do painel",
    placeholder: "Formato da legenda do painel",
    items: [
      { key: "legendLine", label: "Legenda: formato de cada linha", vars: ["nome", "descricao"], def: "-# `{nome}`  {descricao}" },
    ],
  },
  {
    id: "notices",
    title: "Avisos e bloqueios",
    placeholder: "Avisos, bloqueios e erros",
    items: [
      { key: "noCall", label: "Pessoa fora de uma call", vars: [], def: "Você não está em nenhuma call. Entre em uma call de voz do servidor para usar o painel." },
      { key: "noAccess", label: "Cargo sem acesso ao painel", vars: [], def: "Você não tem permissão para usar o painel de calls." },
      { key: "disabled", label: "Gerenciador desativado", vars: [], def: "O gerenciador de calls está desativado neste servidor." },
      { key: "unsupported", label: "Canal sem suporte (palco)", vars: [], def: "O painel só funciona em calls de voz comuns, não em palcos." },
      { key: "ignoredCall", label: "Call ignorada pelo servidor", vars: ["canal"], def: "O painel não funciona em {canal}." },
      { key: "cmdNotMod", label: "Comando do painel sem permissão", vars: ["usuario"], def: "{usuario}, só a moderação pode enviar o painel de calls." },
      { key: "errorGeneric", label: "Erro ao executar uma ação", vars: [], def: "Não consegui concluir. Confira se eu tenho as permissões Gerenciar Canais, Gerenciar Cargos e Mover Membros." },
      { key: "nothingChanged", label: "Nada foi alterado", vars: [], def: "Nada foi alterado." },
    ],
  },
  {
    id: "pickers",
    title: "Seletores de pessoas",
    placeholder: "Seletores de pessoas (títulos e dicas)",
    items: [
      { key: "pickPlaceholder", label: "Texto do seletor", vars: [], def: "Selecione" },
      { key: "lockTitle", label: "Privar: título", vars: [], def: "Privar" },
      { key: "lockHint", label: "Privar: dica", vars: [], def: "Escolha quem pode continuar entrando. Quem já está na call não é expulso." },
      { key: "lockKeepButton", label: "Privar: botão de manter todos", vars: [], def: "Manter só quem está na call" },
      { key: "addTitle", label: "Adicionar: título", vars: [], def: "Adicionar" },
      { key: "addHint", label: "Adicionar: dica", vars: [], def: "Selecione quem pode entrar nesta call." },
      { key: "removeTitle", label: "Remover: título", vars: [], def: "Remover" },
      { key: "removeHint", label: "Remover: dica", vars: [], def: "Selecione de quem você quer tirar a permissão de entrada." },
      { key: "kickTitle", label: "Desconectar: título", vars: [], def: "Desconectar" },
      { key: "kickHint", label: "Desconectar: dica", vars: [], def: "Selecione quem você quer expulsar da call agora." },
      { key: "moveTitle", label: "Mover: título", vars: [], def: "Mover" },
      { key: "moveHint", label: "Mover: dica", vars: [], def: "Selecione quem você quer puxar para esta call. A pessoa precisa estar em algum canal de voz." },
      { key: "transferTitle", label: "Transferir: título", vars: [], def: "Transferir" },
      { key: "transferHint", label: "Transferir: dica", vars: [], def: "Selecione quem vai receber a posse da call. Só aparece quem está na call com você." },
      { key: "blacklistTitle", label: "Blacklist: título", vars: [], def: "Blacklist" },
      { key: "blacklistHint", label: "Blacklist: dica", vars: [], def: "Selecione quem você quer bloquear nesta call. Quem já está bloqueado é liberado." },
    ],
  },
  {
    id: "access",
    title: "Acesso, limite e configuração",
    placeholder: "Acesso, limite e configuração salva",
    items: [
      { key: "lockDone", label: "Call privada (com pessoas)", vars: ["pessoas"], def: "Call privada. Continuam podendo entrar: {pessoas}" },
      { key: "lockAlone", label: "Call privada (sem mais ninguém)", vars: [], def: "Call privada. Só você e quem já tinha acesso conseguem entrar." },
      { key: "unlockDone", label: "Call pública de novo", vars: [], def: "Call pública de novo. Qualquer pessoa pode entrar (menos quem foi bloqueado)." },
      { key: "ownerInfo", label: "Ver Dono: resposta", vars: ["dono", "canal", "acesso", "limite", "pessoas"], def: "**Dono da call:** {dono}\n**Call:** {canal}\n**Acesso:** {acesso} · **Limite:** {limite} · **Na call agora:** {pessoas}" },
      { key: "wordPrivate", label: "Palavra: privada", vars: [], def: "privada" },
      { key: "wordPublic", label: "Palavra: pública", vars: [], def: "pública" },
      { key: "limitNone", label: "Palavra: sem limite", vars: [], def: "sem limite" },
      { key: "limitValue", label: "Limite na lista (Ver Dono)", vars: ["n"], def: "{n} pessoas" },
      { key: "limitShort", label: "Limite no resumo (config)", vars: ["n"], def: "limite de {n}" },
      { key: "limitSet", label: "Limite definido", vars: ["n"], def: "Limite definido: **{n}** pessoas." },
      { key: "limitRemoved", label: "Limite removido", vars: [], def: "Limite removido. A call não tem máximo de pessoas." },
      { key: "limitInvalid", label: "Limite inválido", vars: [], def: "Use apenas números, de 0 a 99." },
      { key: "limitModalTitle", label: "Janela do limite: título", vars: [], def: "Limite da call" },
      { key: "limitModalLabel", label: "Janela do limite: campo", vars: [], def: "Máximo de pessoas" },
      { key: "limitModalDesc", label: "Janela do limite: explicação", vars: [], def: "De 1 a 99. Use 0 para não ter limite." },
      { key: "limitModalPlaceholder", label: "Janela do limite: exemplo", vars: [], def: "Ex.: 5" },
      { key: "saveDone", label: "Configuração salva", vars: ["acesso", "limite", "extra"], def: "Configuração salva: {acesso}, {limite}{extra}." },
      { key: "saveExtra", label: "Configuração salva: pessoas liberadas", vars: ["n"], def: ", {n} pessoa(s) com acesso liberado" },
      { key: "loadNone", label: "Usar Config sem nada salvo", vars: [], def: "Você ainda não salvou nenhuma configuração. Use o botão de salvar primeiro." },
      { key: "loadDone", label: "Configuração aplicada", vars: ["acesso", "limite"], def: "Configuração aplicada: {acesso}, {limite}." },
    ],
  },
  {
    id: "members",
    title: "Membros",
    placeholder: "Resultados de membros (adicionar, remover, mover, desconectar)",
    items: [
      { key: "addDone", label: "Adicionar: liberou", vars: ["pessoas"], def: "Liberei a entrada de: {pessoas}" },
      { key: "addFail", label: "Adicionar: não conseguiu", vars: ["pessoas"], def: "Não consegui liberar: {pessoas}" },
      { key: "removeDone", label: "Remover: tirou a permissão", vars: ["pessoas"], def: "Tirei a permissão de entrada de: {pessoas}" },
      { key: "removeFail", label: "Remover: sem alteração", vars: ["pessoas"], def: "Sem alteração: {pessoas}" },
      { key: "kickDone", label: "Desconectar: desconectou", vars: ["pessoas"], def: "Desconectei: {pessoas}" },
      { key: "kickFail", label: "Desconectar: não conseguiu", vars: ["pessoas"], def: "Não consegui desconectar: {pessoas}" },
      { key: "kickAudit", label: "Desconectar: motivo no registro", vars: [], def: "Desconectado pelo painel de calls" },
      { key: "moveDone", label: "Mover: moveu", vars: ["pessoas"], def: "Movi para esta call: {pessoas}" },
      { key: "moveFail", label: "Mover: não conseguiu", vars: ["pessoas"], def: "Não consegui mover: {pessoas}" },
      { key: "reasonInvalid", label: "Motivo: membro inválido", vars: [], def: "(não é um membro válido)" },
      { key: "reasonSelf", label: "Motivo: é você mesmo", vars: [], def: "(é você)" },
      { key: "reasonProtected", label: "Motivo: pessoa protegida", vars: [], def: "(é da administração)" },
      { key: "reasonBlacklist", label: "Motivo: está bloqueada", vars: [], def: "(está bloqueada nesta call)" },
      { key: "reasonNoPermission", label: "Motivo: sem permissão liberada", vars: [], def: "(não tinha permissão liberada)" },
      { key: "reasonNotInCall", label: "Motivo: não está na call", vars: [], def: "(não está na call)" },
      { key: "reasonNoVoice", label: "Motivo: fora de canal de voz", vars: [], def: "(não está em nenhum canal de voz)" },
      { key: "reasonAlreadyIn", label: "Motivo: já está na call", vars: [], def: "(já está na call)" },
    ],
  },
  {
    id: "tools",
    title: "Transferir e blacklist",
    placeholder: "Transferir e blacklist",
    items: [
      { key: "transferAlone", label: "Transferir: ninguém na call", vars: [], def: "Não tem ninguém na call com você para passar a posse." },
      { key: "transferNotOwner", label: "Transferir: não é o dono", vars: ["dono"], def: "Só o dono da call ({dono}) pode transferir a posse." },
      { key: "transferInvalid", label: "Transferir: pessoa inválida", vars: [], def: "Escolha uma pessoa (bots não podem ser donos)." },
      { key: "transferSelf", label: "Transferir: é você mesmo", vars: [], def: "Você já é o dono desta call." },
      { key: "transferNotIn", label: "Transferir: não está na call", vars: [], def: "A pessoa precisa estar dentro da call para receber a posse." },
      { key: "transferDone", label: "Transferir: concluído", vars: ["pessoa"], def: "A posse da call agora é de {pessoa}." },
      { key: "blAdded", label: "Blacklist: bloqueou", vars: ["pessoas"], def: "Bloqueei: {pessoas}" },
      { key: "blRemoved", label: "Blacklist: liberou", vars: ["pessoas"], def: "Liberei da blacklist: {pessoas}" },
      { key: "blSkipped", label: "Blacklist: sem alteração", vars: ["pessoas"], def: "Sem alteração: {pessoas}" },
      { key: "blAudit", label: "Blacklist: motivo no registro", vars: [], def: "Blacklist da call" },
      { key: "reasonSelfBlock", label: "Blacklist: bloquear a si mesmo", vars: [], def: "(não dá para bloquear você mesmo)" },
      { key: "reasonListFull", label: "Blacklist: lista cheia", vars: [], def: "(limite de 50 bloqueados por call)" },
    ],
  },
];

const ITEMS = GROUPS.flatMap((group) => group.items);
const MESSAGES = Object.fromEntries(ITEMS.map((item) => [item.key, item]));
const MESSAGE_KEYS = ITEMS.map((item) => item.key);
const DEFAULT_MESSAGES = Object.fromEntries(ITEMS.map((item) => [item.key, item.def]));

// Troca {variavel} pelo valor. Variável desconhecida fica como está.
function fmt(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (whole, name) => (vars[name] !== undefined ? String(vars[name]) : whole));
}

// say(cfg, "lockDone", { pessoas: "..." }) → texto configurado (ou o padrão)
function say(cfg, key, vars) {
  const custom = cfg?.msgs?.[key];
  return fmt(typeof custom === "string" && custom.length ? custom : DEFAULT_MESSAGES[key] ?? key, vars);
}

module.exports = { GROUPS, MESSAGES, MESSAGE_KEYS, DEFAULT_MESSAGES, fmt, say };
