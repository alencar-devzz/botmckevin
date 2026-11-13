// Cargos acima do cargo mais alto do bot não geram log de cargos (criar, editar, excluir, dar ou remover de alguém).
function aboveBot(guild, role) {
  const me = guild?.members?.me;
  if (!me || !role) return false; // sem o bot em cache, não filtra
  return role.position > me.roles.highest.position;
}

module.exports = { aboveBot };
