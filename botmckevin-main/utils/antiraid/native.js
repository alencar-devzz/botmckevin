const {
  PermissionFlagsBits,
  SystemChannelFlagsBitField,
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
  AutoModerationRuleKeywordPresetType,
  AutoModerationActionType,
} = require("discord.js");
const { NV_SYSTEM, NV_AUTOMOD, NV_RULE_PREFIX } = require("./defaults");

// Ajustes nativos do Discord feitos pelo painel e regras de AutoMod.
// Todas as funções devolvem null quando deu certo, ou um texto explicando o erro.

const reason = (user) => `Anti-Raid: ajuste pelo painel (${user?.tag ?? "painel"})`;

function explain(err) {
  if (err?.code === 50013 || err?.code === 50001) return "Faltou permissão ao bot (precisa de Gerenciar servidor).";
  const msg = String(err?.rawError?.message ?? err?.message ?? "erro desconhecido");
  return `O Discord recusou a alteração: ${msg.slice(0, 180)}`;
}

const canManageGuild = (guild) => !!guild.members.me?.permissions.has(PermissionFlagsBits.ManageGuild);

async function edit(guild, data, user) {
  if (!canManageGuild(guild)) return "O bot precisa da permissão Gerenciar servidor.";
  return guild.edit(data, reason(user)).then(() => null, explain);
}

// ---- Mensagens do canal de sistema ----

// Chaves de NV_SYSTEM que estão ligadas (o Discord guarda o contrário, como "suprimir")
function systemEnabled(guild) {
  const bits = guild.systemChannelFlags?.bitfield ?? 0;
  return Object.entries(NV_SYSTEM)
    .filter(([, info]) => !(bits & SystemChannelFlagsBitField.Flags[info.flag]))
    .map(([key]) => key);
}

function setSystemMessages(guild, enabledKeys, user) {
  let bits = guild.systemChannelFlags?.bitfield ?? 0;
  for (const [key, info] of Object.entries(NV_SYSTEM)) {
    const bit = SystemChannelFlagsBitField.Flags[info.flag];
    bits = enabledKeys.includes(key) ? bits & ~bit : bits | bit;
  }
  return edit(guild, { systemChannelFlags: bits }, user);
}

// ---- AutoMod ----

const isOurs = (rule) => rule.name.startsWith(NV_RULE_PREFIX);

// Collection de regras, ou null se o bot não conseguir ler (falta Gerenciar servidor)
const fetchRules = (guild) => guild.autoModerationRules.fetch().catch(() => null);

const validExempt = (guild, ids) => ids.filter((id) => guild.roles.cache.has(id)).slice(0, 20);

async function createPreset(guild, key, native, user) {
  const preset = NV_AUTOMOD[key];
  if (!preset) return "Regra desconhecida.";
  if (!canManageGuild(guild)) return "O bot precisa da permissão Gerenciar servidor.";

  const actions = [
    { type: AutoModerationActionType.BlockMessage, metadata: { customMessage: "Mensagem bloqueada pelo Anti-Raid." } },
  ];
  const alert = native.alertChannelId ? guild.channels.cache.get(native.alertChannelId) : null;
  if (alert?.isTextBased()) actions.push({ type: AutoModerationActionType.SendAlertMessage, metadata: { channel: alert.id } });

  const rule = {
    name: preset.name,
    eventType: AutoModerationRuleEventType.MessageSend,
    enabled: true,
    actions,
    exemptRoles: validExempt(guild, native.exemptRoles),
    reason: reason(user),
  };

  if (key === "mention") {
    rule.triggerType = AutoModerationRuleTriggerType.MentionSpam;
    rule.triggerMetadata = { mentionTotalLimit: native.mentionLimit, mentionRaidProtectionEnabled: true };
  } else if (key === "spam") {
    rule.triggerType = AutoModerationRuleTriggerType.Spam;
  } else if (key === "invites") {
    rule.triggerType = AutoModerationRuleTriggerType.Keyword;
    rule.triggerMetadata = { regexPatterns: ["(?i)(?:discord\\.gg|discord(?:app)?\\.com/invite)/[\\w-]+"] };
  } else if (key === "profanity") {
    rule.triggerType = AutoModerationRuleTriggerType.KeywordPreset;
    rule.triggerMetadata = {
      presets: [
        AutoModerationRuleKeywordPresetType.Profanity,
        AutoModerationRuleKeywordPresetType.SexualContent,
        AutoModerationRuleKeywordPresetType.Slurs,
      ],
    };
  }

  return guild.autoModerationRules.create(rule).then(() => null, explain);
}

// Liga e desliga regras para bater com a lista escolhida
async function syncEnabled(guild, shownIds, enabledIds, user) {
  const rules = await fetchRules(guild);
  if (!rules) return "Não consegui ler as regras de AutoMod (falta Gerenciar servidor?).";
  const errors = [];
  for (const id of shownIds) {
    const rule = rules.get(id);
    if (!rule) continue;
    const want = enabledIds.includes(id);
    if (rule.enabled === want) continue;
    const err = await rule.setEnabled(want, reason(user)).then(() => null, explain);
    if (err) errors.push(`${rule.name}: ${err}`);
  }
  return errors.length ? errors.join("\n") : null;
}

// Aplica uma edição a todas as regras criadas pelo painel (e só a elas)
async function editOurRules(guild, make, user) {
  const rules = await fetchRules(guild);
  if (!rules) return "Não consegui ler as regras de AutoMod (falta Gerenciar servidor?).";
  const errors = [];
  for (const rule of rules.values()) {
    const data = isOurs(rule) ? make(rule) : null;
    if (!data) continue;
    const err = await rule.edit({ ...data, reason: reason(user) }).then(() => null, explain);
    if (err) errors.push(`${rule.name}: ${err}`);
  }
  return errors.length ? errors.join("\n") : null;
}

const setMentionLimit = (guild, limit, user) =>
  editOurRules(
    guild,
    (rule) =>
      rule.triggerType === AutoModerationRuleTriggerType.MentionSpam
        ? { triggerMetadata: { mentionTotalLimit: limit, mentionRaidProtectionEnabled: true } }
        : null,
    user
  );

const setExemptRoles = (guild, ids, user) =>
  editOurRules(guild, () => ({ exemptRoles: validExempt(guild, ids) }), user);

module.exports = {
  edit,
  explain,
  canManageGuild,
  systemEnabled,
  setSystemMessages,
  fetchRules,
  isOurs,
  createPreset,
  syncEnabled,
  setMentionLimit,
  setExemptRoles,
};
