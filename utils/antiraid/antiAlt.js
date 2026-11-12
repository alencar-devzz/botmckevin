const { MessageFlags, ContainerBuilder, TextDisplayBuilder } = require("discord.js");
const { getAntiRaidConfig, updateAntiRaidConfig } = require("./store");
const { sendModuleAlert, code } = require("./alert");
const { AA_RESPONSES } = require("./defaults");

const DAY = 86_400_000;
const MAX_TIMEOUT = 28 * DAY;
const BAN_REASON_PREFIX = "Anti-Raid:";
const timers = new Map(); // "guild:user" -> timeout do desbanimento

// ---------- Banimento temporário (sobrevive a reinícios) ----------

async function savePending(guildId, list) {
  await updateAntiRaidConfig(guildId, { "antiAlt.pendingUnbans": list });
}

function scheduleUnban(guild, userId, at) {
  const key = `${guild.id}:${userId}`;
  clearTimeout(timers.get(key));
  const t = setTimeout(async () => {
    timers.delete(key);
    // Só desbane se o banimento ainda é o do Anti-Raid: se um moderador baniu essa pessoa depois,
    // o banimento dele não pode ser desfeito por aqui.
    const ban = await guild.bans.fetch({ user: userId, force: true }).catch(() => null);
    if (ban && String(ban.reason ?? "").startsWith(BAN_REASON_PREFIX)) {
      await guild.members.unban(userId, "Anti-Raid: fim do banimento temporário").catch(() => {});
    }
    const cfg = await getAntiRaidConfig(guild.id);
    await savePending(guild.id, cfg.antiAlt.pendingUnbans.filter((p) => p.id !== userId));
  }, Math.max(1000, at - Date.now()));
  t.unref?.();
  timers.set(key, t);
}

async function resumeUnbans(client) {
  for (const guild of client.guilds.cache.values()) {
    const cfg = await getAntiRaidConfig(guild.id);
    for (const pending of cfg.antiAlt.pendingUnbans) scheduleUnban(guild, pending.id, pending.at);
  }
}

// ---------- Entrada ----------

async function notify(member, minDays, response, banMin) {
  const when =
    response === "tempban"
      ? `Você poderá tentar entrar de novo em cerca de ${banMin >= 60 ? `${Math.round(banMin / 60)} hora(s)` : `${banMin} minutos`}, mas a conta ainda precisa ter ${minDays} dia(s).`
      : `Tente novamente quando a sua conta tiver pelo menos ${minDays} dia(s) de criação.`;
  await member
    .send({
      components: [
        new ContainerBuilder()
          .setAccentColor(0xed4245)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent("### Entrada não permitida"),
            new TextDisplayBuilder().setContent(
              `O servidor **${member.guild.name}** só aceita contas com no mínimo **${minDays} dia(s)** de criação.\n${when}`
            )
          ),
      ],
      flags: MessageFlags.IsComponentsV2,
    })
    .catch(() => {});
}

// Devolve true se a conta foi removida do servidor (expulsa ou banida)
async function onAltJoin(member) {
  if (member.user.bot) return false;
  const { guild } = member;
  const cfg = await getAntiRaidConfig(guild.id);
  const a = cfg.antiAlt;
  if (!a.minAgeDays || a.exemptUsers.includes(member.id)) return false;

  const age = Date.now() - member.user.createdTimestamp;
  const required = a.minAgeDays * DAY;
  if (age >= required) return false;

  if (a.notifyDm) await notify(member, a.minAgeDays, a.response, a.banMin);

  const reason = `${BAN_REASON_PREFIX} conta com menos de ${a.minAgeDays} dia(s)`;
  let ok = false;

  if (a.response === "tempban") {
    // Guarda o desbanimento ANTES de banir: se o bot cair no meio, o banimento não vira permanente
    const at = Date.now() + a.banMin * 60_000;
    const fresh = await getAntiRaidConfig(guild.id);
    const others = fresh.antiAlt.pendingUnbans.filter((p) => p.id !== member.id);
    await savePending(guild.id, [...others, { id: member.id, at }]);
    ok = await member.ban({ reason }).then(() => true).catch(() => false);
    if (ok) scheduleUnban(guild, member.id, at);
    else await savePending(guild.id, others);
  } else if (a.response === "timeout") {
    ok = await member.timeout(Math.min(required - age, MAX_TIMEOUT), reason).then(() => true).catch(() => false);
  } else {
    ok = await member.kick(reason).then(() => true).catch(() => false);
  }

  await sendModuleAlert(guild, cfg, a.alertChannelId, {
    system: "Anti-alt",
    action: "Conta nova barrada",
    author: member.user,
    authorLabel: "Conta",
    fields: [
      ["Idade", `${code(`${(age / DAY).toFixed(1)} dia(s)`)} (mínimo ${a.minAgeDays})`],
      ["Resposta", AA_RESPONSES[a.response].label],
      ["Resultado", ok ? "aplicado" : "não consegui aplicar (permissão ou hierarquia)"],
    ],
  });
  return ok && a.response !== "timeout";
}

module.exports = { onAltJoin, resumeUnbans };
