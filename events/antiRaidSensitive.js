const { onRoleUpdate, onRoleCreate } = require("../utils/antiraid/dangerPerms");
const { onMemberUpdate } = require("../utils/antiraid/protectedRoles");
const { onAuditEntry } = require("../utils/antiraid/movCall");

// Permissões perigosas, Cargos protegidos e Mov call. Erros nunca derrubam o bot.
const wrap = (event) => ({
  ...event,
  async execute(...args) {
    try {
      await event.execute(...args);
    } catch (err) {
      console.error(`[ANTIRAID] Erro no evento "${event.name}":`, err);
    }
  },
});

module.exports = [
  { name: "roleUpdate", execute: onRoleUpdate },
  { name: "roleCreate", execute: onRoleCreate },
  { name: "guildMemberUpdate", execute: onMemberUpdate },
  { name: "guildAuditLogEntryCreate", execute: onAuditEntry },
].map(wrap);
