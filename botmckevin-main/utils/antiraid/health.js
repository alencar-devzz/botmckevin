const { PermissionFlagsBits } = require("discord.js");
const { getAntiRaidConfig } = require("./store");
const { sendModuleAlert } = require("./alert");
const { MODULES } = require("./defaults");

// Verificação de permissões ao ligar o bot. Sem "Ver registro de auditoria", o núcleo e quase todos os
// módulos ficam parados em silêncio (não dá para saber quem fez a ação). Aqui o problema aparece no
// console e no canal de alertas, em vez de o painel mostrar "ligado" sem proteger nada.

const NEEDED = [
  [PermissionFlagsBits.ViewAuditLog, "Ver registro de auditoria (saber quem fez cada ação)"],
  [PermissionFlagsBits.ManageGuild, "Gerenciar servidor (lockdown, convites e reverter o visual)"],
  [PermissionFlagsBits.ManageRoles, "Gerenciar cargos (tirar cargos e reverter permissões)"],
  [PermissionFlagsBits.BanMembers, "Banir membros"],
  [PermissionFlagsBits.KickMembers, "Expulsar membros"],
  [PermissionFlagsBits.ModerateMembers, "Silenciar membros (timeout)"],
  [PermissionFlagsBits.ManageWebhooks, "Gerenciar webhooks (apagar webhook de spam)"],
  [PermissionFlagsBits.ManageMessages, "Gerenciar mensagens (anti-spam e anti-link)"],
];

const warned = new Set();

async function checkGuild(guild) {
  const cfg = await getAntiRaidConfig(guild.id);
  const anyOn = cfg.core.enabled || MODULES.some((m) => m.key !== "core" && !m.info && m.active(cfg));
  if (!anyOn) return;

  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (!me) return;

  const missing = NEEDED.filter(([flag]) => !me.permissions.has(flag)).map(([, label]) => label);

  // Cargos acima do meu só aparecem no console: avisar no canal a cada reinício virava spam
  const above = guild.roles.cache.filter((r) => r.id !== guild.id && !r.managed && r.position > me.roles.highest.position);

  if (!missing.length) {
    if (above.size && !warned.has(guild.id)) {
      warned.add(guild.id);
      console.warn(`[ANTIRAID] ${guild.name}: ${above.size} cargo(s) acima do meu`);
    }
    return;
  }
  if (warned.has(guild.id)) return;
  warned.add(guild.id);

  console.warn(
    `[ANTIRAID] ${guild.name}: ${missing.length ? `faltam permissões (${missing.join("; ")})` : ""}${
      above.size ? ` ${above.size} cargo(s) acima do meu` : ""
    }`
  );

  await sendModuleAlert(guild, cfg, null, {
    system: "Anti-Raid",
    action: "Verificação de permissões",
    color: 0xfaa61a,
    fields: [
      ...(missing.length ? [["Permissões que faltam", missing.map((m) => `• ${m}`).join("\n")]] : []),
    ],
  }).catch(() => {});
}

async function runHealthChecks(client) {
  for (const guild of client.guilds.cache.values()) {
    await checkGuild(guild).catch((err) => console.error("[ANTIRAID] Erro na verificação de permissões:", err.message));
  }
}

module.exports = { runHealthChecks };
