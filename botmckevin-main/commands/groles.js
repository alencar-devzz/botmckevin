const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { getRoleManageConfig, isManager, searchRoles, normalize } = require("../utils/roleManage");
const { renderRolePanel } = require("../handlers/roleManageHandlers");
const { buildNotice } = require("../ui/grolesPanel");
const { resolveTarget } = require("../utils/resolveTarget");

const V2 = MessageFlags.IsComponentsV2;

async function warn(message, content) {
  const sent = await message.channel
    .send({ components: buildNotice(content), flags: V2, allowedMentions: { parse: [] } })
    .catch(() => null);
  setTimeout(() => sent?.delete().catch(() => {}), 6000);
}

// Descobre o que foi marcado: cargo (menção/ID/nome) ou pessoa (menção/ID/nome/resposta). Sem nada = você mesmo.
async function resolveSubject(message, args) {
  const { guild } = message;

  if (!args.length) {
    if (message.reference) {
      const found = await resolveTarget(message, []);
      if (!found.error && found.member) return { member: found.member };
    }
    return { member: message.member };
  }

  const first = args[0];

  const roleMention = first.match(/^<@&(\d+)>$/)?.[1];
  if (roleMention) {
    const role = guild.roles.cache.get(roleMention);
    return role ? { role } : { error: "Não encontrei esse cargo neste servidor." };
  }

  const userMention = first.match(/^<@!?(\d+)>$/)?.[1];
  if (userMention) {
    const member = await guild.members.fetch(userMention).catch(() => null);
    return member ? { member } : { error: "Essa pessoa não está neste servidor." };
  }

  if (/^\d{17,20}$/.test(first)) {
    const role = guild.roles.cache.get(first);
    if (role) return { role };
    const member = await guild.members.fetch(first).catch(() => null);
    return member ? { member } : { error: "Não encontrei nenhum cargo ou pessoa com esse ID." };
  }

  // Texto: cargo com nome igual, depois pessoa pelo nome, depois cargos que contêm o texto
  const query = args.join(" ");
  const roles = searchRoles(guild, query);
  if (roles.length === 1 && normalize(roles[0].name) === normalize(query)) return { role: roles[0] };

  const cached = guild.members.cache.find(
    (m) =>
      m.user.username.toLowerCase() === query.toLowerCase() ||
      m.displayName.toLowerCase() === query.toLowerCase()
  );
  const member =
    cached ??
    (await guild.members
      .fetch({ query: first, limit: 1 })
      .then((r) => r.first())
      .catch(() => null));
  if (member) return { member };

  if (roles.length === 1) return { role: roles[0] };
  if (roles.length > 1) return { results: roles };
  return { error: "Não encontrei nenhum cargo ou pessoa com esse nome. Marque um cargo ou uma pessoa." };
}

module.exports = {
  name: "groles",
  async execute(message, args) {
    const { guild } = message;
    const cfg = await getRoleManageConfig(guild.id);

    if (!cfg.enabled) return warn(message, "O gerenciamento de cargos está desativado neste servidor.");
    if (!isManager(cfg, message.member)) return warn(message, "Você não tem permissão para usar esse comando.");
    if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return warn(message, "Eu preciso da permissão Gerenciar Cargos para fazer isso.");
    }

    const subject = await resolveSubject(message, args);
    if (subject.error) return warn(message, subject.error);

    const base = { a: message.author.id, f: "a", p: 0, x: null };
    let state;
    let results = null;

    if (subject.role) {
      state = { ...base, m: "r", v: "d", t: null, r: subject.role.id };
    } else if (subject.results) {
      state = { ...base, m: "r", v: "s", t: null, r: null };
      results = subject.results;
    } else {
      state = { ...base, m: "u", v: "l", t: subject.member.id, r: null };
    }

    const components = await renderRolePanel({ guild, executor: message.member, state, results });
    await message.channel.send({ components, flags: V2, allowedMentions: { parse: [] } });
  },
};
