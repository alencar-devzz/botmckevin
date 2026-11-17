const { PermissionFlagsBits } = require("discord.js");
const store = require("./store");
const { getInviteConfig } = require("./configStore");

// Rastreador de convites do /convites. Guarda uma "foto" dos usos de cada convite do servidor
// e, a cada entrada, compara com a foto nova para descobrir qual convite foi usado.
//
// Casos tratados:
//  - convite normal: o que teve "uses" aumentado;
//  - convite de uso limitado (maxUses) que some quando o último uso acontece: o que sumiu e estava no limite;
//  - URL personalizada (vanity) e entradas sem convite conhecido: ficam sem dono (ninguém ganha o ponto);
//  - várias entradas ao mesmo tempo: processadas uma de cada vez por servidor, para não misturar donos.

// guildId -> { invites: Map(code -> { uses, maxUses, inviterId }), vanityUses: number | null }
const snapshots = new Map();
// guildId -> fila (Promise) de entradas sendo processadas
const queues = new Map();

const inviterOf = (invite) => invite.inviterId ?? invite.inviter?.id ?? null;

const toEntry = (invite) => ({ uses: invite.uses ?? 0, maxUses: invite.maxUses ?? 0, inviterId: inviterOf(invite) });

const canTrack = (guild) => guild.members.me?.permissions.has(PermissionFlagsBits.ManageGuild) ?? false;

async function fetchInvites(guild) {
  if (!canTrack(guild)) return null;
  return guild.invites.fetch().catch(() => null);
}

async function fetchVanityUses(guild) {
  if (!guild.vanityURLCode || !canTrack(guild)) return null;
  const data = await guild.fetchVanityData().catch(() => null);
  return data?.uses ?? null;
}

// Tira a foto do servidor (usada ao ligar, ao entrar em um servidor novo e depois de cada entrada).
async function snapshot(guild) {
  const list = await fetchInvites(guild);
  if (!list) return false;
  const vanityUses = await fetchVanityUses(guild);
  snapshots.set(guild.id, { invites: new Map(list.map((i) => [i.code, toEntry(i)])), vanityUses });
  await store.syncLinks(guild.id, list).catch((err) => console.error("[CONVITES] Erro ao salvar os convites:", err.message));
  return true;
}

function isTracking(guildId) {
  return snapshots.has(guildId);
}

function forget(guildId) {
  snapshots.delete(guildId);
  queues.delete(guildId);
}

// Convite novo: entra na foto sem precisar buscar tudo de novo.
function addInvite(invite) {
  const snap = snapshots.get(invite.guild?.id);
  if (snap) snap.invites.set(invite.code, toEntry(invite));
}

// Convite apagado: continua na foto (a última entrada pode ter vindo dele). Sai na próxima foto completa.
function markDeleted(invite) {
  const entry = snapshots.get(invite.guild?.id)?.invites.get(invite.code);
  if (entry) entry.deleted = true;
}

// Descobre qual convite trouxe o membro. Retorna { code, inviterId } ou null.
async function detect(guild) {
  const before = snapshots.get(guild.id);
  const list = await fetchInvites(guild);
  if (!list) return null;

  const fresh = new Map(list.map((i) => [i.code, toEntry(i)]));
  const vanityUses = await fetchVanityUses(guild);
  snapshots.set(guild.id, { invites: fresh, vanityUses });
  store.syncLinks(guild.id, list).catch(() => {});

  if (!before) return null; // sem foto anterior não há com o que comparar

  // 1) convite que ganhou usos (o de maior aumento, se por acaso houver mais de um)
  let best = null;
  for (const [code, entry] of fresh) {
    const gained = entry.uses - (before.invites.get(code)?.uses ?? 0);
    if (gained > 0 && (!best || gained > best.gained)) best = { code, gained, inviterId: entry.inviterId };
  }
  if (best) return { code: best.code, inviterId: best.inviterId };

  // 2) convite com limite de usos que sumiu justamente por causa desta entrada
  for (const [code, entry] of before.invites) {
    if (fresh.has(code)) continue;
    if (entry.maxUses > 0 && entry.uses + 1 >= entry.maxUses) return { code, inviterId: entry.inviterId };
  }

  // 3) URL personalizada: conta como entrada, mas não tem dono
  if (vanityUses !== null && before.vanityUses !== null && vanityUses > before.vanityUses) {
    return { code: guild.vanityURLCode, inviterId: null };
  }

  return null;
}

// Processa a entrada de um membro (uma de cada vez por servidor).
// Devolve o inviterId quando a entrada foi contada (para o painel checar recompensas), ou null.
function trackJoin(member) {
  const guild = member.guild;
  const run = async () => {
    if (member.user?.bot) return null;
    const found = await detect(guild);
    if (!found?.inviterId) return null;
    if (found.inviterId === member.id) return null; // entrar pelo próprio convite não vale

    // Sistema desligado no n!menu > Comunidade e interação > Convites: continua detectando
    // (para a foto não ficar desatualizada), mas não grava a entrada nem conta o convite.
    const cfg = await getInviteConfig(guild.id).catch(() => null);
    if (cfg && cfg.enabled === false) return null;

    await store.recordJoin({
      guildId: guild.id,
      inviterId: found.inviterId,
      userId: member.id,
      code: found.code,
      accountCreatedAt: member.user.createdTimestamp,
    });
    return found.inviterId;
  };

  const next = (queues.get(guild.id) ?? Promise.resolve())
    .then(run)
    .catch((err) => {
      console.error("[CONVITES] Erro ao registrar a entrada:", err.message);
      return null;
    });
  queues.set(guild.id, next);
  return next;
}

async function trackLeave(member) {
  if (member.user?.bot) return;
  // espera as entradas pendentes terminarem (quem entra e sai em segundos não fica "aberto" para sempre)
  await (queues.get(member.guild.id) ?? Promise.resolve());
  await store.recordLeave(member.guild.id, member.id);
}

module.exports = { snapshot, isTracking, forget, addInvite, markDeleted, trackJoin, trackLeave };
