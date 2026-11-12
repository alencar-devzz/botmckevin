// Log dos cargos dados/removidos pelo painel do n!groles.
// Tudo o que o mesmo staff fizer na mesma pessoa (em sequência) sai numa única embed:
//  - só adicionados  -> embed com os adicionados
//  - só removidos    -> embed com os removidos
//  - os dois         -> uma embed com os adicionados e os removidos
const { activeCategory, deliver } = require("./send");
const { add, listLimited } = require("./batch");
const { COLORS, code, userBrief } = require("./format");

// O staff clica um cargo por vez, então espera mais que o padrão antes de enviar
const WINDOW = 12_000; // sem novas ações por esse tempo -> envia
const MAX_WAIT = 90_000; // limite total de espera

// @cargo · `nome` · `id`
const roleLine = (role) => `<@&${role.id}> · ${code(role.name)} · ${code(role.id)}`;

// Mantém um registro por cargo e tipo; se a pessoa clicar de novo no mesmo cargo/tipo, não repete
function unique(items, kind) {
  const seen = new Set();
  return items.filter((i) => {
    if (i.kind !== kind || seen.has(i.role.id)) return false;
    seen.add(i.role.id);
    return true;
  });
}

async function flush(guild, cfg, target, executor, items) {
  const added = unique(items, "add");
  const removed = unique(items, "rem");
  if (!added.length && !removed.length) return;

  const groups = [[userBrief(target.user), `**Executado por:** <@${executor.id}>`]];

  if (added.length === 1) groups.push([`**Cargo adicionado:** ${roleLine(added[0].role)}`]);
  else if (added.length) {
    groups.push([`**Cargos adicionados (${added.length}):**`, ...listLimited(added.map((i) => roleLine(i.role)), 20)]);
  }

  if (removed.length === 1) groups.push([`**Cargo removido:** ${roleLine(removed[0].role)}`]);
  else if (removed.length) {
    groups.push([`**Cargos removidos (${removed.length}):**`, ...listLimited(removed.map((i) => roleLine(i.role)), 20)]);
  }

  let title;
  if (added.length && removed.length) title = "Cargos alterados pelo painel";
  else if (added.length) title = `Cargo${added.length > 1 ? "s" : ""} adicionado${added.length > 1 ? "s" : ""} pelo painel`;
  else title = `Cargo${removed.length > 1 ? "s" : ""} removido${removed.length > 1 ? "s" : ""} pelo painel`;

  return deliver(guild, cfg, {
    title: `${title} — ${guild.name}`,
    color: added.length && removed.length ? COLORS.white : added.length ? COLORS.green : COLORS.red,
    thumbnail: target.displayAvatarURL(),
    groups,
  });
}

// kind: "add" | "rem"
async function logPanelRoleChange({ guild, executor, target, role, kind }) {
  const cfg = await activeCategory(guild, "cargos");
  if (!cfg) return;

  add(
    `groles:${guild.id}:${executor.id}:${target.id}`,
    { kind, role: { id: role.id, name: role.name } },
    (items) => flush(guild, cfg, target, executor, items),
    { window: WINDOW, maxWait: MAX_WAIT }
  );
}

module.exports = { logPanelRoleChange };
