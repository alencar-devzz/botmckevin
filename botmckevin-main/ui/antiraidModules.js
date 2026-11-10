const {
  ContainerBuilder,
  SectionBuilder,
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
const { COLOR, text, divider, btn, row, tag } = ui;

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

function toggleSection(id, title, desc, on) {
  return new SectionBuilder()
    .addTextDisplayComponents(text(`**${title}**  ${tag(on)}\n-# ${desc}`))
    .setButtonAccessory(on ? btn(id, "Desligar", ButtonStyle.Danger) : btn(id, "Ligar", ButtonStyle.Success));
}

function flagSection(id, title, desc, on) {
  return new SectionBuilder()
    .addTextDisplayComponents(text(`**${title}**  \`${on ? "SIM" : "NÃO"}\`\n-# ${desc}`))
    .setButtonAccessory(btn(id, on ? "Desativar" : "Ativar"));
}

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

  const container = new ContainerBuilder()
    .setAccentColor(!m.enabled ? COLOR.off : paused || locked ? COLOR.test : COLOR.on)
    .addTextDisplayComponents(
      text("### Entrada em massa"),
      text("-# Percebe ondas de contas entrando juntas e eleva a verificação do servidor por um tempo. Volume sozinho só gera alerta.")
    )
    .addSeparatorComponents(divider());

  container.addSectionComponents(
    toggleSection("ar:mj:toggle", "Detecção", "Liga ou desliga a análise de entradas.", m.enabled)
  );

  if (locked) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(text(`**Lockdown em andamento**\n-# Termina ${ts(m.lockdown.until)}.`))
        .setButtonAccessory(btn("ar:mj:endlock", "Encerrar agora", ButtonStyle.Danger))
    );
  }

  container.addTextDisplayComponents(
    text(`**Gatilho**\n-# Começa a analisar com **${m.threshold}** entradas em **${m.windowSec}s**.`)
  );
  container.addActionRowComponents(
    pickOne("ar:mj:threshold", "Quantidade de entradas", nums(D.MJ_THRESHOLDS, (n) => `${n} entradas`), m.threshold),
    pickOne("ar:mj:window", "Janela de análise", nums(D.MJ_WINDOWS, (n) => `em ${n} segundos`), m.windowSec)
  );

  container.addTextDisplayComponents(
    text("**Sinais de conta suspeita**\n-# Uma conta é suspeita quando tem sinais suficientes. O lockdown exige metade do gatilho em contas suspeitas.")
  );
  container.addActionRowComponents(
    pickMany("ar:mj:signals", "Quais sinais contam", D.MJ_SIGNALS, m.signals),
    pickOne("ar:mj:minsignals", "Sinais necessários", nums([1, 2, 3], (n) => `${n} sinal(is) por conta`), m.minSignals),
    pickOne("ar:mj:newdays", "Conta nova é a de até", nums(D.MJ_NEWACC_DAYS, (n) => `até ${n} dia(s) de criação`), m.newAccountDays)
  );

  container.addTextDisplayComponents(text("**Resposta**\n-# Nível de verificação, duração e o que fazer com os suspeitos."));
  container.addActionRowComponents(
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
    )
  );

  container.addSeparatorComponents(divider());
  container.addTextDisplayComponents(
    text(
      `**Modo evento**\n-# ${
        paused ? `Análise pausada, volta ${ts(m.pausedUntil)}.` : "Análise normal. Pause durante divulgações e eventos legítimos."
      }`
    )
  );
  container.addActionRowComponents(
    pickOne(
      "ar:mj:pause",
      "Pausar a análise",
      D.MJ_PAUSE_MIN.map((n) => ({
        label: n === 0 ? "Análise normal (retomar)" : n >= 60 ? `Pausar por ${n / 60} hora(s)` : `Pausar por ${n} minutos`,
        value: String(n),
      })),
      "none"
    )
  );

  container.addTextDisplayComponents(text("**Canal de alertas**\n-# Vazio usa o canal do núcleo."));
  container.addActionRowComponents(alertPick("ar:mj:alert", guild, m.alertChannelId));

  container.addSeparatorComponents(divider());
  container.addActionRowComponents(row(btn("ar:hub", "Voltar")));
  return [container];
}

// ======================= Anti-spam =======================

function buildSpamPanel(guild, cfg) {
  const s = cfg.spam;

  const container = new ContainerBuilder()
    .setAccentColor(s.enabled ? COLOR.on : COLOR.off)
    .addTextDisplayComponents(
      text("### Anti-spam"),
      text("-# Detecta flood de mensagens por pessoa. Aqui fica a detecção; a resposta e as exceções ficam no outro painel.")
    )
    .addSeparatorComponents(divider());

  container.addSectionComponents(toggleSection("ar:sp:toggle", "Anti-spam", "Liga ou desliga a análise de mensagens.", s.enabled));
  container.addSectionComponents(
    flagSection("ar:sp:staff", "Ignorar equipe", "Quem tem Gerenciar Mensagens nunca é analisado.", s.ignoreStaff)
  );
  container.addSectionComponents(
    flagSection("ar:sp:signal", "Exigir sinal de spam", "Com isso ligado, só volume não pune: precisa de um dos sinais abaixo.", s.requireSignal)
  );

  container.addSeparatorComponents(divider());
  container.addTextDisplayComponents(
    text(`**Gatilho**\n-# **${s.limit}** mensagens em **${s.windowSec}s**.`)
  );
  container.addActionRowComponents(
    pickOne("ar:sp:limit", "Quantidade de mensagens", nums(D.SPAM_LIMITS, (n) => `${n} mensagens`), s.limit),
    pickOne("ar:sp:window", "Janela de tempo", nums(D.SPAM_WINDOWS, (n) => `em ${n} segundos`), s.windowSec)
  );

  container.addTextDisplayComponents(text("**Sinais de spam**\n-# O que conta como spam além do volume."));
  container.addActionRowComponents(
    pickMany("ar:sp:signals", "Quais sinais contam", D.SPAM_SIGNALS, s.signals),
    pickOne("ar:sp:mentions", "Limite de menções", nums(D.SPAM_MENTIONS, (n) => `${n} menções numa mensagem`), s.mentionLimit)
  );

  container.addSeparatorComponents(divider());
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      btn("ar:mod:spamResp", "Resposta e exceções", ButtonStyle.Primary),
      btn("ar:hub", "Voltar")
    )
  );
  return [container];
}

function buildSpamResponsePanel(guild, cfg) {
  const s = cfg.spam;

  const container = new ContainerBuilder()
    .setAccentColor(s.enabled ? COLOR.on : COLOR.off)
    .addTextDisplayComponents(
      text("### Anti-spam · resposta e exceções"),
      text("-# O que acontece com quem faz spam e quem fica de fora da análise.")
    )
    .addSeparatorComponents(divider());

  container.addTextDisplayComponents(
    text(`**Avisos antes do timeout**\n-# ${s.warnings === 0 ? "Timeout direto, sem aviso." : `${s.warnings} aviso(s), cada um some em ${s.warnSec}s.`}`)
  );
  container.addActionRowComponents(
    pickOne(
      "ar:sp:warnings",
      "Quantidade de avisos",
      nums(D.SPAM_WARNINGS, (n) => (n === 0 ? "Timeout direto" : `${n} aviso(s)`)),
      s.warnings
    ),
    pickOne("ar:sp:warnsec", "Tempo do aviso na tela", nums(D.SPAM_WARN_SEC, (n) => `some em ${n} segundos`), s.warnSec)
  );

  container.addTextDisplayComponents(text("**Duração do timeout**"));
  container.addActionRowComponents(
    pickOne(
      "ar:sp:timeout",
      "Duração",
      nums(D.SPAM_TIMEOUT_MIN, (n) => (n >= 1440 ? "1 dia" : n >= 60 ? `${n / 60} hora(s)` : `${n} minuto(s)`)),
      s.timeoutMin
    )
  );

  container.addSectionComponents(
    flagSection("ar:sp:delete", "Apagar as mensagens do flood", "Remove as mensagens que formaram a detecção.", s.deleteMessages)
  );

  container.addSeparatorComponents(divider());
  container.addTextDisplayComponents(text("**Exceções**\n-# Cargos, canais (ou categorias) e pessoas que o Anti-spam ignora."));

  const roles = new RoleSelectMenuBuilder().setCustomId("ar:sp:xroles").setPlaceholder("Cargos isentos").setMinValues(0).setMaxValues(25);
  const validRoles = s.exemptRoles.filter((id) => guild.roles.cache.has(id)).slice(0, 25);
  if (validRoles.length) roles.setDefaultRoles(...validRoles);

  const users = new UserSelectMenuBuilder().setCustomId("ar:sp:xusers").setPlaceholder("Pessoas isentas").setMinValues(0).setMaxValues(25);
  if (s.exemptUsers.length) users.setDefaultUsers(...s.exemptUsers.slice(0, 25));

  container.addActionRowComponents(
    row(roles),
    channelPick("ar:sp:xchannels", "Canais isentos", guild, s.exemptChannels, 25),
    row(users)
  );

  container.addTextDisplayComponents(text("**Canal de alertas**\n-# Vazio usa o canal do núcleo."));
  container.addActionRowComponents(alertPick("ar:sp:alert", guild, s.alertChannelId));

  container.addSeparatorComponents(divider());
  container.addActionRowComponents(row(btn("ar:mod:spam", "Voltar")));
  return [container];
}

module.exports = {
  buildMassJoinPanel,
  buildSpamPanel,
  buildSpamResponsePanel,
  helpers: { pickOne, pickMany, nums, toggleSection, flagSection, alertPick, channelPick },
};
