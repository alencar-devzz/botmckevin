// Cargos do painel do comando n!tag. A ordem é a dos botões (botão 1 = cargo 1, e assim por diante).
// key: identifica o botão (customId "tag:<key>") | roleId: cargo entregue | emoji: ícone do botão
const TAG_ROLES = [
  {
    key: "freefire",
    roleId: "1571582511258013796",
    emoji: { name: "freefire", id: "1571583600565162088" },
  },
  {
    key: "roblox",
    roleId: "1571582566689935482",
    emoji: { name: "roblox", id: "1571583870204252393" },
  },
  {
    key: "valorant",
    roleId: "1571582632209293423",
    emoji: { name: "valorant", id: "1571584108717539369" },
  },
];

module.exports = { TAG_ROLES };
