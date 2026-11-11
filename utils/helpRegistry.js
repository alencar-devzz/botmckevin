const { PermissionsBitField } = require("discord.js");
const { ALL_STAFF_ROLE_IDS } = require("./staffRoles");
const { getPrefix, DEFAULT_PREFIX } = require("./getPrefix");

// ---------------------------------------------------------------------------
// DESCOBERTA AUTOMÁTICA DE COMANDOS (usada pelo /help)
//
// Nada aqui precisa ser editado quando você cria um comando novo. Cada arquivo de
// commands/ vira UMA linha no /help:
//  - Slash (/): todo comando que exporta "data" (SlashCommandBuilder). Descrição, opções,
//    subcomandos e permissão são lidos do próprio builder.
//  - Prefixo: todo comando que exporta "execute". Se tiver os dois, a linha mostra "/nome · prefixo".
//
// Campos opcionais que o comando pode exportar para melhorar o /help:
//    description: "O que o comando faz."       (sem isso usa a do slash)
//    usage: "nome <argumento> [opcional]"      (uso no prefixo, sem o prefixo)
//    category: "Moderação"                     (sem isso cai em "Outros"; categorias novas aparecem sozinhas)
//    staffOnly: true                           (só a equipe vê no /help)
//    hidden: true                              (não aparece no /help)
// ---------------------------------------------------------------------------

// Textos/categorias dos comandos que já existiam antes do /help (os novos não precisam estar aqui).
const FALLBACK = {
  ban: { category: "Moderação" },
  unban: { category: "Moderação" },
  kick: { category: "Moderação" },
  mute: { category: "Moderação" },
  unmute: { category: "Moderação" },
  limpar: {
    category: "Moderação",
    description: "Apaga mensagens do canal.",
    usage: "limpar <quantidade>",
    staffOnly: true,
  },
  cl: {
    category: "Moderação",
    description: "Apaga as suas mensagens do canal. Também funciona sem prefixo, digitando só `cl`.",
    usage: "cl",
  },
  regras: { category: "Comunidade", description: "Envia o painel de regras do servidor.", usage: "regras", staffOnly: true },
  booster: { category: "Comunidade", description: "Envia o painel de boosters.", usage: "booster", staffOnly: true },
  botcall: {
    category: "Comunidade",
    description: "Envia o painel para o bot entrar e ficar em uma call.",
    usage: "botcall",
    staffOnly: true,
  },
  painel: {
    category: "Comunidade",
    description: "Envia o painel de gerenciamento das calls temporárias.",
    usage: "painel",
    staffOnly: true,
  },
  mensagem: { category: "Comunidade", description: "Abre o criador de mensagens.", usage: "mensagem", staffOnly: true },
  groles: {
    category: "Comunidade",
    description: "Gerencia os cargos de uma pessoa pelo painel.",
    usage: "groles <cargo ou pessoa>",
  },
  menu: { category: "Configuração", description: "Abre o menu de configurações do bot.", usage: "menu", staffOnly: true },
  painelps: { category: "Configuração", description: "Envia o painel do Anti-Raid.", usage: "painelps", staffOnly: true },
  ticket: {
    category: "Sistemas",
    description: "Envia um painel de tickets no canal.",
    usage: "ticket [nome do painel]",
    staffOnly: true,
  },
};

const CATEGORY_ORDER = ["Moderação", "Comunidade", "Configuração", "Sistemas", "Utilidades"];
const DEFAULT_CATEGORY = "Outros";

const PERMISSION_PT = {
  Administrator: "Administrador",
  BanMembers: "Banir Membros",
  KickMembers: "Expulsar Membros",
  ModerateMembers: "Castigar Membros",
  ManageMessages: "Gerenciar Mensagens",
  ManageRoles: "Gerenciar Cargos",
  ManageChannels: "Gerenciar Canais",
  ManageGuild: "Gerenciar Servidor",
  ManageNicknames: "Gerenciar Apelidos",
  ManageWebhooks: "Gerenciar Webhooks",
  MuteMembers: "Silenciar Membros",
  MoveMembers: "Mover Membros",
  DeafenMembers: "Ensurdecer Membros",
  ViewAuditLog: "Ver Registro de Auditoria",
};

const OPTION_TYPE = {
  3: "texto",
  4: "número inteiro",
  5: "sim/não",
  6: "usuário",
  7: "canal",
  8: "cargo",
  9: "menção",
  10: "número",
  11: "arquivo",
};
const SUBCOMMAND = 1;
const SUBCOMMAND_GROUP = 2;

const slugify = (value) =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "outros";

function optionView(option) {
  return {
    name: option.name,
    description: option.description ?? "",
    required: Boolean(option.required),
    type: OPTION_TYPE[option.type] ?? "valor",
  };
}

function permissionNames(bits) {
  if (!bits) return [];
  return new PermissionsBitField(bits)
    .toArray()
    .map((name) => PERMISSION_PT[name] ?? name.replace(/([a-z])([A-Z])/g, "$1 $2"));
}

const usageFromOptions = (name, options) =>
  [name, ...options.map((o) => (o.required ? `<${o.name}>` : `[${o.name}]`))].join(" ");

// Lê o client.commands e devolve UM item por comando (slash e/ou prefixo)
function getCommands(client) {
  const list = [];
  // Os aliases apontam para o mesmo comando, então o Set remove as repetições.
  for (const command of new Set(client.commands.values())) {
    if (!command || !command.name || command.hidden === true) continue;

    const slash = command.data && typeof command.data.toJSON === "function" ? command.data.toJSON() : null;
    const hasSlash = Boolean(slash);
    const hasPrefix = typeof command.execute === "function";
    if (!hasSlash && !hasPrefix) continue;

    const fallback = FALLBACK[command.name] ?? {};

    const options = [];
    const subs = [];
    for (const option of slash?.options ?? []) {
      if (option.type === SUBCOMMAND_GROUP) {
        for (const sub of option.options ?? []) {
          subs.push({
            path: `${option.name} ${sub.name}`,
            description: sub.description ?? "",
            options: (sub.options ?? []).map(optionView),
          });
        }
      } else if (option.type === SUBCOMMAND) {
        subs.push({ path: option.name, description: option.description ?? "", options: (option.options ?? []).map(optionView) });
      } else {
        options.push(optionView(option));
      }
    }

    const category = command.category ?? fallback.category ?? DEFAULT_CATEGORY;

    list.push({
      key: command.name,
      hasSlash,
      hasPrefix,
      slashName: slash?.name ?? null,
      prefixName: hasPrefix ? command.name : null,
      aliases: command.aliases ?? [],
      description:
        command.description ?? fallback.description ?? slash?.description ?? "Sem descrição cadastrada.",
      options,
      subs,
      usage: hasPrefix ? (command.usage ?? fallback.usage ?? usageFromOptions(command.name, options)) : null,
      permission: slash?.default_member_permissions ? BigInt(slash.default_member_permissions) : null,
      staffOnly: command.staffOnly ?? fallback.staffOnly ?? false,
      category,
      categorySlug: slugify(category),
    });
  }
  return list.sort((a, b) => (a.slashName ?? a.key).localeCompare(b.slashName ?? b.key, "pt-BR"));
}

function isStaff(member, memberPermissions) {
  if (memberPermissions?.has(PermissionsBitField.Flags.Administrator)) return true;
  const roles = member?.roles;
  if (roles?.cache) return roles.cache.hasAny(...ALL_STAFF_ROLE_IDS);
  if (Array.isArray(roles)) return roles.some((id) => ALL_STAFF_ROLE_IDS.includes(id));
  return false;
}

// Cada pessoa só vê no /help o que pode usar
function canSee(entry, { member, memberPermissions }) {
  if (entry.permission && !memberPermissions?.has(entry.permission)) return false;
  if (entry.staffOnly && !isStaff(member, memberPermissions)) return false;
  return true;
}

// Categorias que realmente têm comandos visíveis (aparecem e somem sozinhas)
function buildCategories(commands) {
  const map = new Map();
  for (const c of commands) {
    const cur = map.get(c.categorySlug) ?? { slug: c.categorySlug, name: c.category, count: 0 };
    cur.count += 1;
    map.set(c.categorySlug, cur);
  }
  const rank = (name) => {
    const i = CATEGORY_ORDER.indexOf(name);
    if (i >= 0) return i;
    return name === DEFAULT_CATEGORY ? 1000 : 100;
  };
  return [...map.values()].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, "pt-BR"));
}

// Tudo que o /help precisa, já filtrado para quem usou o comando
async function collectHelp(interaction) {
  const { client, guild, member, memberPermissions } = interaction;
  const commands = getCommands(client).filter((entry) => canSee(entry, { member, memberPermissions }));
  return {
    commands,
    categories: buildCategories(commands),
    prefix: guild ? await getPrefix(guild.id) : DEFAULT_PREFIX,
  };
}

module.exports = { getCommands, collectHelp, permissionNames, isStaff, slugify };
