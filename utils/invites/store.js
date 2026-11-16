const InviteLink = require("../../database/models/InviteLink");
const InviteJoin = require("../../database/models/InviteJoin");

const DAY_MS = 86_400_000;

// Conta com menos de INVITE_FAKE_DAYS dias na hora da entrada = "conta recente" (fake). Padrão: 7 dias.
const FAKE_DAYS = Math.max(1, Number(process.env.INVITE_FAKE_DAYS) || 7);

const inviterOf = (invite) => invite.inviterId ?? invite.inviter?.id ?? null;

// ---------- Convites (links) ----------

// Guarda os convites que já existem (os que foram criados com o bot desligado, por exemplo).
// Só insere o que falta: nunca sobrescreve nem "ressuscita" um convite já marcado como apagado.
async function syncLinks(guildId, invites) {
  const ops = [];
  for (const invite of invites.values()) {
    const inviterId = inviterOf(invite);
    if (!inviterId) continue;
    ops.push({
      updateOne: {
        filter: { guildId, code: invite.code },
        update: { $setOnInsert: { guildId, code: invite.code, inviterId, createdAt: invite.createdAt ?? new Date() } },
        upsert: true,
      },
    });
  }
  if (ops.length) await InviteLink.bulkWrite(ops, { ordered: false });
}

async function recordLinkCreated(guildId, invite) {
  const inviterId = inviterOf(invite);
  if (!inviterId) return;
  await InviteLink.updateOne(
    { guildId, code: invite.code },
    { $setOnInsert: { guildId, code: invite.code, inviterId, createdAt: invite.createdAt ?? new Date() } },
    { upsert: true }
  );
}

async function recordLinkDeleted(guildId, code) {
  await InviteLink.updateOne({ guildId, code, deletedAt: null }, { $set: { deletedAt: new Date() } });
}

// ---------- Entradas e saídas ----------

async function recordJoin({ guildId, inviterId, userId, code, accountCreatedAt }) {
  const joinedAt = new Date();
  await InviteJoin.create({
    guildId,
    inviterId,
    userId,
    code,
    joinedAt,
    leftAt: null,
    accountAgeMs: Math.max(0, joinedAt.getTime() - accountCreatedAt),
  });
}

// Marca a saída da entrada mais recente que ainda estava "aberta".
async function recordLeave(guildId, userId) {
  await InviteJoin.findOneAndUpdate(
    { guildId, userId, leftAt: null },
    { $set: { leftAt: new Date() } },
    { sort: { joinedAt: -1 } }
  );
}

// Corrige quem saiu enquanto o bot estava desligado: entradas "abertas" de quem não está mais no servidor.
async function reconcileLeft(guild) {
  const open = await InviteJoin.distinct("userId", { guildId: guild.id, leftAt: null });
  const gone = open.filter((userId) => !guild.members.cache.has(userId));
  if (!gone.length) return 0;
  const res = await InviteJoin.updateMany(
    { guildId: guild.id, userId: { $in: gone }, leftAt: null },
    { $set: { leftAt: new Date() } }
  );
  return res.modifiedCount ?? 0;
}

// ---------- Estatísticas ----------

async function getStats(guildId, inviterId) {
  const limit = FAKE_DAYS * DAY_MS;
  const [links, [agg]] = await Promise.all([
    InviteLink.countDocuments({ guildId, inviterId }),
    InviteJoin.aggregate([
      { $match: { guildId, inviterId } },
      {
        $group: {
          _id: null,
          joined: { $sum: 1 },
          left: { $sum: { $cond: [{ $ne: [{ $ifNull: ["$leftAt", null] }, null] }, 1, 0] } },
          fake: { $sum: { $cond: [{ $lt: ["$accountAgeMs", limit] }, 1, 0] } },
        },
      },
    ]),
  ]);

  return { links, joined: agg?.joined ?? 0, left: agg?.left ?? 0, fake: agg?.fake ?? 0, fakeDays: FAKE_DAYS };
}

module.exports = {
  FAKE_DAYS,
  syncLinks,
  recordLinkCreated,
  recordLinkDeleted,
  recordJoin,
  recordLeave,
  reconcileLeft,
  getStats,
};
