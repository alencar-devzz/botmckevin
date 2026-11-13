// Carrega todos os membros no cache ao ligar o bot.
// Sem isso, depois de um reinício o discord.js só conhece quem já mexeu em algo, e o evento guildMemberUpdate
// chega com o membro "antigo" incompleto (partial). Resultado: os logs de cargos adicionados/removidos e de castigo,
// e a proteção de cargos protegidos do Anti-Raid, ignoravam a mudança; o log de saída vinha sem os cargos.
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadMembers(guild) {
  if (guild.members.cache.size >= guild.memberCount) return;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await guild.members.fetch({ time: 60_000 });
      return;
    } catch (err) {
      if (attempt === 3) {
        console.error(`[MEMBROS] Não consegui carregar os membros de ${guild.name}:`, err.message);
        return;
      }
      await wait(attempt * 15_000); // o gateway limita esse pedido: espera e tenta de novo
    }
  }
}

module.exports = [
  {
    name: "clientReady",
    once: true,
    async execute(client) {
      // um servidor por vez, sem travar o resto da inicialização
      (async () => {
        for (const guild of client.guilds.cache.values()) await loadMembers(guild);
      })().catch((err) => console.error("[MEMBROS] Erro ao carregar os membros:", err.message));
    },
  },
  {
    name: "guildCreate", // servidor novo: carrega também
    async execute(guild) {
      await loadMembers(guild).catch(() => {});
    },
  },
];
