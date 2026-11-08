// Valores padrão do sistema "Calls temporárias" (call criada quando alguém entra no canal gatilho).
// Tudo aqui pode ser alterado depois pelo menu: Comunidade e interação → Calls temporárias.
// Estes valores só valem enquanto o servidor não editou o texto correspondente.

const DEFAULT_NAME_TEMPLATE = "{nametag}";

// Seções do painel de gerenciamento da call (mesma ordem da tela)
const SECTIONS = [
  { id: "access", titleKey: "accessTitle", keys: ["lock", "unlock", "limit", "owner"] },
  { id: "members", titleKey: "membersTitle", keys: ["add", "remove", "kick", "move"] },
  { id: "tools", titleKey: "toolsTitle", keys: ["transfer", "blacklist", "save", "load"] },
];

// [nome do botão, descrição]
const DEFAULT_BUTTONS = {
  lock: ["Privar", "fecha a call e escolhe quem pode continuar entrando"],
  unlock: ["Desprivar", "devolve o acesso público ao canal"],
  limit: ["Limite", "define o máximo de pessoas que cabem na call"],
  owner: ["Ver Dono", "exibe quem está no controle do canal"],
  add: ["Adicionar", "libera a entrada de um usuário específico"],
  remove: ["Remover", "tira a permissão de entrada de alguém"],
  kick: ["Desconectar", "expulsa um usuário que está na call agora"],
  move: ["Mover", "puxa alguém de outro canal direto pra sua call"],
  transfer: ["Transferir", "passa o controle da call pra outro membro"],
  blacklist: ["Blacklist", "bloqueia um usuário de entrar na sua call"],
  save: ["Salvar Config", "grava as configurações atuais da call"],
  load: ["Usar Config", "aplica uma configuração que você salvou antes"],
};

const BUTTON_KEYS = Object.keys(DEFAULT_BUTTONS);

const DEFAULT_TEXTS = {
  title: "Gerenciamento de Call",
  desc: "Utilize os botões abaixo para gerenciar sua call.",
  footer: "-# Só o dono da call consegue usar os botões.", // "nenhum" = sem rodapé
  accessTitle: "Acesso e Privacidade",
  membersTitle: "Gerenciar Membros",
  toolsTitle: "Ferramentas",
};
for (const key of BUTTON_KEYS) {
  DEFAULT_TEXTS[`b_${key}`] = DEFAULT_BUTTONS[key][0]; // nome do botão
  DEFAULT_TEXTS[`d_${key}`] = DEFAULT_BUTTONS[key][1]; // descrição ao lado
}

const TEXT_KEYS = Object.keys(DEFAULT_TEXTS);

module.exports = { DEFAULT_NAME_TEMPLATE, SECTIONS, DEFAULT_BUTTONS, BUTTON_KEYS, DEFAULT_TEXTS, TEXT_KEYS };
