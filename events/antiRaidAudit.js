const { AuditLogEvent } = require("discord.js");
const hub = require("../utils/antiraid/auditHub");
const { trackEntry, ENTRY_ACTION } = require("../utils/antiraid/engine");
const { onRoleEntry } = require("../utils/antiraid/dangerPerms");
const { onGrantEntry: onProtectedGrant } = require("../utils/antiraid/protectedRoles");
const { onAuditEntry: onMovCall } = require("../utils/antiraid/movCall");
const { runHealthChecks } = require("../utils/antiraid/health");

// Ponto único de entrada do registro de auditoria. O Discord manda cada entrada em tempo real,
// já com o autor da ação, e o hub repassa para o módulo certo:
//   núcleo (exclusões, criações, bans, kicks, webhooks, convites...), permissões perigosas,
//   cargos protegidos e mov call.
// As entradas também ficam guardadas por 1 minuto para quem precisa delas depois (anti-bot, visual).
// Exige a permissão "Ver registro de auditoria" e a intent GuildModeration.

hub.register(Object.keys(ENTRY_ACTION).map(Number), trackEntry);
hub.register([AuditLogEvent.RoleUpdate, AuditLogEvent.RoleCreate], onRoleEntry);
hub.register([AuditLogEvent.MemberRoleUpdate], onProtectedGrant);
hub.register([AuditLogEvent.MemberMove, AuditLogEvent.MemberDisconnect], onMovCall);

module.exports = [
  {
    name: "guildAuditLogEntryCreate",
    async execute(entry, guild) {
      try {
        await hub.dispatch(entry, guild);
      } catch (err) {
        console.error("[ANTIRAID] Erro no hub de auditoria:", err);
      }
    },
  },
  {
    name: "clientReady",
    once: true,
    async execute(client) {
      // dá um tempo para o cache de membros e cargos carregar
      setTimeout(() => runHealthChecks(client).catch(() => {}), 10_000).unref?.();
    },
  },
];
