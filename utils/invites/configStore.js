const InviteConfig = require("../../database/models/InviteConfig");

// Cache curto (60s) para não bater no banco a cada entrada/saída de membro.
const TTL = 60_000;
const cache = new Map(); // guildId -> { cfg, at }

const int = (value, fallback, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : fallback;
};

function toConfig(doc) {
  return {
    enabled: doc?.enabled ?? true,
    fakeDays: int(doc?.fakeDays, 7, 0, 365),
    achievementsChannelId: doc?.achievementsChannelId ?? null,
    announceRewards: doc?.announceRewards ?? true,
    rewards: Array.isArray(doc?.rewards)
      ? doc.rewards
          .map((r) => ({ roleId: String(r.roleId), invites: int(r.invites, 1, 1, 1_000_000) }))
          .sort((a, b) => a.invites - b.invites)
          .slice(0, 20)
      : [],
    bonuses: Array.isArray(doc?.bonuses)
      ? doc.bonuses.map((b) => ({ userId: String(b.userId), amount: int(b.amount, 0, -1_000_000, 1_000_000) }))
      : [],
    rewardsGranted: int(doc?.rewardsGranted, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

async function getInviteConfig(guildId) {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < TTL) return hit.cfg;
  const doc = await InviteConfig.findOne({ guildId }).lean();
  const cfg = toConfig(doc);
  cache.set(guildId, { cfg, at: Date.now() });
  return cfg;
}

async function updateInviteConfig(guildId, patch) {
  const doc = await InviteConfig.findOneAndUpdate(
    { guildId },
    { $set: patch },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  const cfg = toConfig(doc);
  cache.set(guildId, { cfg, at: Date.now() });
  return cfg;
}

// Apaga o documento: tudo volta ao padrão (não apaga o histórico de convites/entradas)
async function resetInviteConfig(guildId) {
  await InviteConfig.deleteOne({ guildId });
  const cfg = toConfig(null);
  cache.set(guildId, { cfg, at: Date.now() });
  return cfg;
}

function getBonus(cfg, userId) {
  return cfg.bonuses.find((b) => b.userId === userId)?.amount ?? 0;
}

async function setBonus(guildId, userId, amount) {
  const cfg = await getInviteConfig(guildId);
  const bonuses = cfg.bonuses.filter((b) => b.userId !== userId);
  if (amount !== 0) bonuses.push({ userId, amount });
  return updateInviteConfig(guildId, { bonuses });
}

async function addReward(guildId, roleId, invites) {
  const cfg = await getInviteConfig(guildId);
  if (cfg.rewards.length >= 20 && !cfg.rewards.some((r) => r.roleId === roleId)) {
    return { cfg, limited: true };
  }
  const rewards = cfg.rewards.filter((r) => r.roleId !== roleId);
  rewards.push({ roleId, invites });
  return { cfg: await updateInviteConfig(guildId, { rewards }), limited: false };
}

async function removeRewards(guildId, roleIds) {
  const cfg = await getInviteConfig(guildId);
  const rewards = cfg.rewards.filter((r) => !roleIds.includes(r.roleId));
  return updateInviteConfig(guildId, { rewards });
}

async function incrementGranted(guildId, amount = 1) {
  const cfg = await getInviteConfig(guildId);
  return updateInviteConfig(guildId, { rewardsGranted: cfg.rewardsGranted + amount });
}

module.exports = {
  getInviteConfig,
  updateInviteConfig,
  resetInviteConfig,
  getBonus,
  setBonus,
  addReward,
  removeRewards,
  incrementGranted,
};
