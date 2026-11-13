const {
  ActionRowBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelType,
} = require("discord.js");
const { ui } = require("./antiraid");
const D = require("../utils/antiraid/defaults");

// Painéis das partes 2: Entrada em massa e Anti-spam.
const { text, btn, row, tag, box, header, backRow, toggleBtn, flagBtn } = ui;

const ts = (ms) => `<t:${Math.floor(ms / 1000)}:R>`;

// ---------- Helpers de componentes ----------

function pickOne(id, placeholder, options, current) {
  return row(
    new StringSelectMenuBuilder()
      .setCustomId(id)
      .setPlaceholder(placeholder)
      .addOptions(options.map((o) => ({ ...o, default: String(o.value) === String(current) })))
  );
}

function pickMany(id, placeholder, map, current) {
  return row(
    new StringSelectMenuBuilder()
      .setCustomId(id)
      .setPlaceholder(placeholder)
      .setMinValues(0)
      .setMaxValues(Object.keys(map).length)
      .addOptions(Object.entries(map).map(([value, label]) => ({ label, value, default: current.includes(value) })))
  );
}

const nums = (list, fmt) => list.map((n) => ({ label: fmt(n), value: String(n) }));

function channelPick(id, placeholder, guild, ids, max) {
  const select = new ChannelSelectMenuBuilder()
    .setCustomId(id)
    .setPlaceholder(placeholder)
    .setChannelTypes(
      ChannelType.GuildText,
      ChannelType.GuildAnnouncement,
      ChannelType.GuildVoice,
      ChannelType.GuildStageVoice,
      ChannelType.GuildForum,
      ChannelType.GuildCategory
    )
    .setMinValues(0)
    .setMaxValues(max);
  const valid = ids.filter((c) => guild.channels.cache.has(c)).slice(0, max);
  if (valid.length) select.setDefaultChannels(...valid);
  return row(select);
}

function alertPick(id, guild, channelId) {
  const select = new ChannelSelectMenuBuilder()
    .setCustomId(id)
    .setPlaceholder("Canal de alertas")
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(0)
    .setMaxValues(1);
  if (channelId && guild.channels.cache.has(channelId)) select.setDefaultChannels(channelId);
  return row(select);
}

// ======================= Entrada em massa =======================

function buildMassJoinPanel(guild, cfg) {
  const m = cfg.massJoin;
  const now = Date.now();
  const paused = m.pausedUntil > now;
  const locked = !!m.lockdown && m.lockdown.until > now;

  const estado = box()
    .addTextDisplayComponents(
      text(
        [
          "### Detecção",
          `-# Percebe ondas de contas entrando juntas e eleva a verificação do servidor por um tempo (e pausa convites e DMs, se ligado). Volume sozinho só gera alerta, a não ser que chegue a ${m.threshold * (m.volumeFactor || 2)} entradas na janela e "Volume alto = lockdown" esteja ligado.`,
          `**Análise de entradas**  ${tag(m.enabled)}`,
          locked ? `**Lockdown em andamento**  termina ${ts(m.lockdown.until)}` : null,
        ]
          .filter(Boolean)
          .join("\n")
      )
    )
    .addActionRowComponents(
      row(
        toggleBtn("ar:mj:toggle", m.enabled),
        ...(locked ? [btn("ar:mj:endlock", "Encerrar lockdown", ButtonStyle.Danger)] : [])
      )
    );

  const gatilho = box()
    .addTextDisplayComponents(text(`### Gatilho\n-# Começa a analisar com **${m.threshold}** entradas em **${m.windowSec}s**.`))
    .addActionRowComponents(
      pickOne("ar:mj:threshold", "Quantidade de entradas", nums(D.MJ_THRESHOLDS, (n) => `${n} entradas`), m.threshold),
      pickOne("ar:mj:window", "Janela de análise", nums(D.MJ_WINDOWS, (n) => `em ${n} segundos`), m.windowSec)
    );

  const sinais = box()
    .addTextDisplayComponents(
      text("### Sinais de conta suspeita\n-# Uma conta é suspeita quando tem sinais suficientes. O lockdown exige metade do gatilho em contas suspeitas.")
    )
    .addActionRowComponents(
      pickMany("ar:mj:signals", "Quais sinais contam", D.MJ_SIGNALS, m.signals),
      pickOne("ar:mj:minsignals", "Sinais necessários", nums([1, 2, 3], (n) => `${n} sinal(is) por conta`), m.minSignals),
      pickOne("ar:mj:newdays", "Conta nova é a de até", nums(D.MJ_NEWACC_DAYS, (n) => `até ${n} dia(s) de criação`), m.newAccountDays)
    );

  const resposta = box()
    .addTextDisplayComponents(text("### Resposta\n-# Nível de verificação, duração e o que fazer com os suspeitos."))
    .addActionRowComponents(
      pickOne(
        "ar:mj:level",
        "Verificação durante o lockdown",
        Object.entries(D.MJ_LEVELS).map(([value, i]) => ({ label: i.label, description: i.desc, value })),
        m.lockdownLevel
      ),
      pickOne("ar:mj:lockmin", "Duração do lockdown", nums(D.MJ_LOCK_MIN, (n) => (n >= 60 ? `${n / 60} hora(s)` : `${n} minutos`)), m.lockdownMin),
      pickOne(
        "ar:mj:suspect",
        "Suspeitos",
        Object.entries(D.MJ_SUSPECT_ACTIONS).map(([value, i]) => ({ label: i.label, description: i.desc, value })),
        m.suspectAction
      ),
      pickMany(
        "ar:mj:opts",
        "Opções do lockdown",
        {
          volume: `Volume muito alto (${m.threshold * (m.volumeFactor || 2)}+ entradas) aciona o lockdown`,
          invites: "Pausar a criação de convites durante o lockdown",
          dms: "Pausar as DMs entre membros durante o lockdown",
        },
        [m.volumeLockdown && "volume", m.pauseInvites && "invites", m.pauseDms && "dms"].filter(Boolean)
      )
    );

  const evento = box()
    .addTextDisplayComponents(
      text(
        `### Modo evento e alertas\n-# ${
          paused ? `Análise pausada, volta ${ts(m.pausedUntil)}.` : "Análise normal. Pause durante divulgações e eventos legítimos."
        } Canal de alertas vazio usa o canal do núcleo.`
      )
    )
    .addActionRowComponents(
      pickOne(
        "ar:mj:pause",
        "Pausar a análise",
        D.MJ_PAUSE_MIN.map((n) => ({
          label: n === 0 ? "Análise normal (retomar)" : n >= 60 ? `Pausar por ${n / 60} hora(s)` : `Pausar por ${n} minutos`,
          value: String(n),
        })),
        "none"
      ),
      alertPick("ar:mj:alert", guild, m.alertChannelId)
    );

  return [header("Entrada em massa", "Entrada em massa"), estado, gatilho, sinais, resposta, evento, backRow()];
}

// ======================= Anti-spam =======================

function buildSpamPanel(guild, cfg) {
  const s = cfg.spam;

  const estado = box()
    .addTextDisplayComponents(
      text(
        [
          "### Proteção",
          "-# Detecta flood de mensagens por pessoa. Aqui fica a detecção; a resposta e as exceções ficam no outro painel.",
          `**Anti-spam**  ${tag(s.enabled)}`,
          `**Ignorar equipe**  \`${s.ignoreStaff ? "Sim" : "Não"}\`  ·  quem tem Gerenciar Mensagens nunca é analisado`,
          `**Exigir sinal de spam**  \`${s.requireSignal ? "Sim" : "Não"}\`  ·  ligado, só volume não pune até ${s.limit * (s.volumeFactor || 2)} mensagens na janela`,
          `**Analisar webhooks**  \`${s.includeWebhooks ? "Sim" : "Não"}\`  ·  webhook que faz spam é apagado`,
        ].join("\n")
      )
    )
    .addActionRowComponents(
      row(
        toggleBtn("ar:sp:toggle", s.enabled),
        flagBtn("ar:sp:staff", "Ignorar equipe", s.ignoreStaff),
        flagBtn("ar:sp:signal", "Exigir sinal", s.requireSignal),
        flagBtn("ar:sp:webhooks", "Webhooks", s.includeWebhooks)
      )
    );

  const gatilho = box()
    .addTextDisplayComponents(text(`### Gatilho\n-# **${s.limit}** mensagens em **${s.windowSec}s**.`))
    .addActionRowComponents(
      pickOne("ar:sp:limit", "Quantidade de mensagens", nums(D.SPAM_LIMITS, (n) => `${n} mensagens`), s.limit),
      pickOne("ar:sp:window", "Janela de tempo", nums(D.SPAM_WINDOWS, (n) => `em ${n} segundos`), s.windowSec)
    );

  const sinais = box()
    .addTextDisplayComponents(text("### Sinais de spam\n-# O que conta como spam além do volume."))
    .addActionRowComponents(
      pickMany("ar:sp:signals", "Quais sinais contam", D.SPAM_SIGNALS, s.signals),
      pickOne("ar:sp:mentions", "Limite de menções", nums(D.SPAM_MENTIONS, (n) => `${n} menções numa mensagem`), s.mentionLimit)
    );

  return [
    header("Anti-spam", "Anti-spam"),
    estado,
    gatilho,
    sinais,
    row(btn("ar:mod:spamResp", "Resposta e exceções", ButtonStyle.Primary), btn("ar:hub", "Voltar")),
  ];
}

function buildSpamResponsePanel(guild, cfg) {
  const s = cfg.spam;

  const avisos = box()
    .addTextDisplayComponents(
      text(
        `### Avisos antes do timeout\n-# ${
          s.warnings === 0 ? "Timeout direto, sem aviso." : `${s.warnings} aviso(s), cada um some em ${s.warnSec}s.`
        }`
      )
    )
    .addActionRowComponents(
      pickOne(
        "ar:sp:warnings",
        "Quantidade de avisos",
        nums(D.SPAM_WARNINGS, (n) => (n === 0 ? "Timeout direto" : `${n} aviso(s)`)),
        s.warnings
      ),
      pickOne("ar:sp:warnsec", "Tempo do aviso na tela", nums(D.SPAM_WARN_SEC, (n) => `some em ${n} segundos`), s.warnSec)
    );

  const timeout = box()
    .addTextDisplayComponents(
      text(
        `### Timeout\n-# Duração do silenciamento de quem faz flood.\n**Apagar as mensagens do flood**  \`${
          s.deleteMessages ? "Sim" : "Não"
        }\`  ·  remove as mensagens que formaram a detecção`
      )
    )
    .addActionRowComponents(
      pickOne(
        "ar:sp:timeout",
        "Duração",
        nums(D.SPAM_TIMEOUT_MIN, (n) => (n >= 1440 ? "1 dia" : n >= 60 ? `${n / 60} hora(s)` : `${n} minuto(s)`)),
        s.timeoutMin
      ),
      row(flagBtn("ar:sp:delete", "Apagar mensagens", s.deleteMessages))
    );

  const roles = new RoleSelectMenuBuilder().setCustomId("ar:sp:xroles").setPlaceholder("Cargos isentos").setMinValues(0).setMaxValues(25);
  const validRoles = s.exemptRoles.filter((id) => guild.roles.cache.has(id)).slice(0, 25);
  if (validRoles.length) roles.setDefaultRoles(...validRoles);

  const users = new UserSelectMenuBuilder().setCustomId("ar:sp:xusers").setPlaceholder("Pessoas isentas").setMinValues(0).setMaxValues(25);
  if (s.exemptUsers.length) users.setDefaultUsers(...s.exemptUsers.slice(0, 25));

  const excecoes = box()
    .addTextDisplayComponents(text("### Exceções\n-# Cargos, canais (ou categorias) e pessoas que o Anti-spam ignora."))
    .addActionRowComponents(row(roles), channelPick("ar:sp:xchannels", "Canais isentos", guild, s.exemptChannels, 25), row(users));

  const alertas = box()
    .addTextDisplayComponents(text("### Canal de alertas\n-# Vazio usa o canal do núcleo."))
    .addActionRowComponents(alertPick("ar:sp:alert", guild, s.alertChannelId));

  return [header("Anti-spam · resposta e exceções", "Anti-spam › Resposta"), avisos, timeout, excecoes, alertas, backRow("ar:mod:spam")];
}

module.exports = {
  buildMassJoinPanel,
  buildSpamPanel,
  buildSpamResponsePanel,
  helpers: { pickOne, pickMany, nums, alertPick, channelPick },
};
