// Troca as variáveis das mensagens da Portaria (boas-vindas, saída e DM).
// Funciona no título, na mensagem e no rodapé. Maiúsculas e minúsculas tanto faz: {User} = {user}.
const VARIABLES = [
  ["{user}", "Menção do membro"],
  ["{username}", "Nome de usuário do membro"],
  ["{displayname}", "Apelido do membro no servidor"],
  ["{id}", "ID do membro"],
  ["{server}", "Nome do servidor"],
  ["{membercount}", "Total de membros do servidor"],
  ["{criada}", "Quando a conta foi criada (ex: há 3 anos)"],
  ["{criada_data}", "Data completa de criação da conta"],
  ["{entrada}", "Quando entrou no servidor (ex: há 2 minutos)"],
  ["{hoje}", "Data de hoje"],
];

const unix = (ms) => Math.floor((Number(ms) || Date.now()) / 1000);

function variablesOf(member) {
  const user = member.user ?? member;
  const username = user.username ?? "";
  return {
    user: `<@${member.id}>`,
    usertag: user.tag ?? username, // compatível com mensagens antigas
    username,
    displayname: member.displayName ?? user.globalName ?? username,
    id: member.id,
    server: member.guild?.name ?? "",
    membercount: String(member.guild?.memberCount ?? ""),
    criada: `<t:${unix(user.createdTimestamp)}:R>`,
    criada_data: `<t:${unix(user.createdTimestamp)}:F>`,
    entrada: `<t:${unix(member.joinedTimestamp)}:R>`,
    hoje: `<t:${unix(Date.now())}:D>`,
  };
}

// Sempre devolve texto (vazio se não houver nada). Variáveis desconhecidas ficam como o usuário digitou.
function applyVariables(template, member) {
  const vars = variablesOf(member);
  return String(template ?? "").replace(/\{([a-z_]+)\}/gi, (whole, name) => {
    const value = vars[name.toLowerCase()];
    return value === undefined ? whole : value;
  });
}

// Mantido por compatibilidade: devolve null quando não há mensagem
function formatMessage(template, member) {
  if (!template) return null;
  return applyVariables(template, member);
}

module.exports = { formatMessage, applyVariables, VARIABLES };
