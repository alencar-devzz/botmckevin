const { AuditLogEvent } = require("discord.js");
const { sendModuleAlert, code } = require("./alert");
const { getAntiRaidConfig } = require("./store");
const { CORE_ACTIONS, PUNISHMENTS } = require("./defaults");

// Núcleo do Anti-Raid: conta ações em massa feitas por uma mesma pessoa/bot
// (lidas em tempo real do registro de auditoria, via hub) e responde conforme o painel.

// Tipo de entrada do registro de auditoria -> chave usada no painel (CORE_ACTIONS)
const ENTRY_ACTION = {
  [AuditLogEvent.ChannelDelete]: "channelDelete",
  [AuditLogEvent.ChannelCreate]: "channelCreate",
  [AuditLogEvent.RoleDelete]: "roleDelete",
  [AuditLogEvent.RoleCreate]: "roleCreate",
  [AuditLogEvent.MemberBanAdd]: "ban",
  [AuditLogEvent.MemberKick]: "kick",
};

const hits = new Map(); // "guild:autor:acao" -> [timestamps]
const cooldown = new Map(); // "guild:autor" -> timestamp do último disparo
const COOLDOWN_MS = 30_000;

async function isExempt(guild, cfg, executorId) {
  if (executorId === guild.client.user.id || executorId === guild.ownerId) return true;
  if (cfg.core.exemptUsers.includes(executorId)) return true;
  if (!cfg.core.exemptRoles.length) return false;
  const member = await guild.members.fetch(executorId).catch(() => null);
  return !!member?.roles.cache.hasAny(...cfg.core.exemptRoles);
}

// Aplica a punição escolhida e devolve um texto com o resultado
async function punish(guild, executorId, punishment) {
  if (punishment === "none") return "Nenhuma punição configurada.";
  const reason = "Anti-Raid: ações em massa";
  const member = await guild.members.fetch(executorId).catch(() => null);

  if (!member) {
    if (punishment === "ban") {
      const ok = await guild.members.ban(executorId, { reason }).then(() => true).catch(() => false);
      return ok ? "Autor já tinha saído; banido." : "Autor já tinha saído e o banimento falhou.";
    }
    return "Autor já não está no servidor.";
  }

  if (punishment === "ban") {
    const ok = await member.ban({ reason }).then(() => true).catch(() => false);
    return ok ? "Autor banido." : "Não consegui banir (cargo dele acima do meu?).";
  }

  // strip e kick começam removendo os cargos
  const removable = member.roles.cache.filter((r) => r.id !== guild.id && !r.managed && r.editable);
  let stripped = false;
  if (removable.size) {
    stripped = await member.roles.remove(removable, reason).then(() => true).catch(() => false);
  }

  if (punishment === "kick") {
    const ok = await member.kick(reason).then(() => true).catch(() => false);
    return ok ? "Cargos removidos e autor expulso." : "Não consegui expulsar (cargo dele acima do meu?).";
  }

  if (stripped) return `${removable.size} cargo(s) removido(s).`;
  return removable.size ? "Não consegui remover os cargos." : "Não havia cargos que eu pudesse remover.";
}

// Chamado pelo hub (events/antiRaidAudit.js) para cada entrada que bater com ENTRY_ACTION
async function trackEntry(entry, guild) {
  const action = ENTRY_ACTION[entry.action];
  if (!action) return;

  const cfg = await getAntiRaidConfig(guild.id);
  const { core } = cfg;
  if (!core.enabled || !core.actions.includes(action)) return;

  const executorId = entry.executorId;
  if (!executorId || (await isExempt(guild, cfg, executorId))) return;

  const key = `${guild.id}:${executorId}:${action}`;
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < core.windowSec * 1000);
  list.push(now);
  hits.set(key, list);

  if (list.length < core.limit) return;

  const coolKey = `${guild.id}:${executorId}`;
  if (now - (cooldown.get(coolKey) ?? 0) < COOLDOWN_MS) return;
  cooldown.set(coolKey, now);
  hits.delete(key);

  const live = core.mode === "live";
  const result = live ? await punish(guild, executorId, core.punishment) : "Nada foi aplicado (modo teste).";

  await sendModuleAlert(guild, cfg, null, {
    system: "Anti-Raid",
    action: live ? "Punição aplicada" : "Simulação (modo teste)",
    author: executorId,
    color: live ? 0xff0000 : 0xffffff,
    fields: [
      ["Ação", CORE_ACTIONS[action]],
      ["Gatilho", `${code(`${list.length} ações em ${core.windowSec}s`)} (limite ${core.limit})`],
      ["Punição configurada", PUNISHMENTS[core.punishment].label],
      ["Resultado", result],
    ],
  });
}

module.exports = { trackEntry, ENTRY_ACTION, punish };
