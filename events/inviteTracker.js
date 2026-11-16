const tracker = require("../utils/invites/tracker");
const store = require("../utils/invites/store");

// Eventos do /convites: mantêm a foto dos convites do servidor e gravam entradas e saídas.
// Precisa das intents Guilds, GuildMembers e GuildInvites e da permissão "Gerenciar Servidor" no bot.
const log = (what) => (err) => console.error(`[CONVITES] ${what}:`, err.message);

// Espera o cache de membros ficar completo (o memberCacheLoader carrega em segundo plano) para
// descobrir quem saiu enquanto o bot estava desligado.
async function reconcileWhenReady(guild) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (guild.members.cache.size >= guild.memberCount) {
      const fixed = await store.reconcileLeft(guild);
      if (fixed) console.log(`[CONVITES] ${fixed} saída(s) ocorridas offline ajustadas em ${guild.name}.`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 30_000));
  }
}

async function setup(guild) {
  if (!(await tracker.snapshot(guild))) {
    console.warn(`[CONVITES] Sem acesso aos convites de ${guild.name} (falta "Gerenciar Servidor").`);
  }
  reconcileWhenReady(guild).catch(log("Erro ao ajustar as saídas"));
}

module.exports = [
  {
    name: "clientReady",
    once: true,
    async execute(client) {
      for (const guild of client.guilds.cache.values()) await setup(guild).catch(log("Erro ao iniciar"));
    },
  },
  { name: "guildCreate", execute: (guild) => setup(guild).catch(log("Erro ao iniciar")) },
  { name: "guildDelete", execute: (guild) => tracker.forget(guild.id) },
  {
    name: "inviteCreate",
    async execute(invite) {
      if (!invite.guild) return;
      tracker.addInvite(invite);
      await store.recordLinkCreated(invite.guild.id, invite).catch(log("Erro ao salvar o convite"));
    },
  },
  {
    name: "inviteDelete",
    async execute(invite) {
      if (!invite.guild) return;
      tracker.markDeleted(invite);
      await store.recordLinkDeleted(invite.guild.id, invite.code).catch(log("Erro ao marcar o convite apagado"));
    },
  },
  { name: "guildMemberAdd", execute: (member) => tracker.trackJoin(member) },
  { name: "guildMemberRemove", execute: (member) => tracker.trackLeave(member).catch(log("Erro ao registrar a saída")) },
];
