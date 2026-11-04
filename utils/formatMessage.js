// Troca as variáveis das mensagens da Portaria (boas-vindas, saída e DM)
//   {user}         menção do membro
//   {username}     nome de usuário
//   {usertag}      nome de usuário (compatível com mensagens antigas)
//   {id}           ID do membro
//   {server}       nome do servidor
//   {membercount}  total de membros do servidor
const VARIABLES = [
  ["{user}", "Menção do membro"],
  ["{username}", "Nome de usuário do membro"],
  ["{id}", "ID do membro"],
  ["{server}", "Nome do servidor"],
  ["{membercount}", "Total de membros do servidor"],
];

function formatMessage(template, member) {
  if (!template) return null;
  const username = member.user?.username ?? member.username ?? "";
  return template
    .replaceAll("{user}", `<@${member.id}>`)
    .replaceAll("{usertag}", member.user?.tag ?? member.tag ?? username)
    .replaceAll("{username}", username)
    .replaceAll("{id}", member.id)
    .replaceAll("{server}", member.guild.name)
    .replaceAll("{membercount}", String(member.guild.memberCount ?? ""));
}

module.exports = { formatMessage, VARIABLES };
