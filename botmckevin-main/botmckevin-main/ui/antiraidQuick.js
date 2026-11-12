const { StringSelectMenuBuilder, ChannelSelectMenuBuilder, ButtonStyle, ChannelType } = require("discord.js");
const { ui } = require("./antiraid");
const D = require("../utils/antiraid/defaults");
const { missingPerms } = require("../utils/antiraid/panic");

// Telas rápidas do Anti-Raid: início (informações + pânico), ajustes do pânico e histórico de incidentes.
// Tudo em Components V2, sem cor de destaque, no mesmo estilo dos outros painéis.
// IDs: "ar:quick" (início), "ar:pn:*" (pânico), "ar:hist" e "ar:hi:*" (histórico).
const { text, clip, divider, btn, row, tag, box, header, backRow } = ui;

const ts = (ms, style = "R") => `<t:${Math.floor(ms / 1000)}:${style}>`;
const minutes = (n) => (n >= 60 ? `${n / 60} hora(s)` : `${n} minutos`);
const labelsOf = (keys) => keys.filter((k) => k in D.PANIC_ACTIONS).map((k) => D.PANIC_ACTIONS[k].label);

// ======================= Início =======================
// notice: { title, lines } com o resultado da última ação do pânico (opcional)
function buildQuickPanel(guild, cfg, stats = {}, notice = null) {
  const { core, massJoin: mj, panic: p } = cfg;
  const now = Date.now();
  const counted = D.MODULES.filter((m) => m.key !== "core" && !m.info);
  const activeModules = counted.filter((m) => m.active(cfg)).length;
  const locked = !!mj.lockdown && mj.lockdown.until > now;

  const situacao = [
    "### Situação agora",
    `**Pânico**  ${p.active ? `\`Ativo\`  termina ${ts(p.active.until)}` : "`Desligado`"}`,
    `**Lockdown automático**  ${locked ? `\`Ativo\`  termina ${ts(mj.lockdown.until)}` : "`Nenhum`"}`,
    `**Núcleo**  ${tag(core.enabled)}  ${core.mode === "live" ? "punição real" : "modo teste"}`,
  ].join("\n");

  const deteccao = [
    "### Detecção",
    `**Gatilho do núcleo**  ${core.limit} ações em ${core.windowSec}s`,
    `**Módulos ligados**  ${activeModules} de ${counted.length}`,
    `**Canal de alertas**  ${core.alertChannelId ? `<#${core.alertChannelId}>` : "sem canal definido"}`,
  ].join("\n");

  const last = stats.last;
  const registro = [
    "### Registro",
    `**Incidentes em 24h**  \`${stats.last24h ?? 0}\``,
    `**Último**  ${last ? `${ts(new Date(last.at).getTime())}  ${clip(last.system, 40)}${last.action ? ` — ${clip(last.action, 50)}` : ""}` : "nenhum registrado"}`,
  ].join("\n");

  const info = box()
    .addTextDisplayComponents(text(`## Central Anti-Raid\n-# ${clip(guild.name, 80)}`))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(situacao))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(deteccao))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(registro));

  // Pânico
  const missing = missingPerms(guild, p.actions);
  const panicLines = [
    "### Pânico",
    "-# Para quando o raid está acontecendo. Aplica as defesas de uma vez e o segundo clique desfaz.",
  ];
  if (p.active) {
    const a = p.active;
    const applied = [a.invites && "convites pausados", a.dms && "DMs pausadas", a.verification && "verificação alta", a.lock && "chat trancado"].filter(Boolean);
    panicLines.push(
      `**Ativo desde**  ${ts(a.since)}  por <@${a.by}>`,
      `**Termina**  ${ts(a.until)}`,
      `**Aplicado**  ${applied.join(" · ") || "nada"}`
    );
  } else {
    panicLines.push(
      `**Ao acionar**  ${labelsOf(p.actions).join(" · ") || "nenhuma ação escolhida"}`,
      ...(p.actions.includes("verification") ? [`**Verificação**  ${D.MJ_LEVELS[p.level]?.label ?? "Muito alto"}`] : []),
      `**Duração**  ${minutes(p.durationMin)}`
    );
    if (missing.length) panicLines.push(`-# Faltam permissões do bot: ${missing.join(", ")}.`);
  }

  const panico = box()
    .addTextDisplayComponents(text(panicLines.join("\n")))
    .addActionRowComponents(
      row(
        p.active ? btn("ar:pn:off", "Desativar pânico", ButtonStyle.Success) : btn("ar:pn:on", "Ativar pânico", ButtonStyle.Danger),
        btn("ar:pn:cfg", "Ajustar pânico")
      )
    );

  // Resto dos sistemas
  const outros = box()
    .addTextDisplayComponents(
      text(
        [
          "### Outros sistemas",
          "-# Núcleo, entrada em massa, anti-spam, anti-link, bots, cargos protegidos e as demais proteções ficam no menu de configuração, junto com o histórico de incidentes.",
        ].join("\n")
      )
    )
    .addActionRowComponents(row(btn("ar:hub", "Abrir sistemas", ButtonStyle.Primary)));

  const parts = [];
  if (notice) {
    parts.push(
      box().addTextDisplayComponents(
        text([`### ${notice.title}`, ...notice.lines.map((l) => `- ${l}`)].join("\n"))
      )
    );
  }
  return [...parts, info, panico, outros];
}

// ======================= Ajustes do pânico =======================
function buildPanicPanel(guild, cfg) {
  const p = cfg.panic;

  const alert = new ChannelSelectMenuBuilder()
    .setCustomId("ar:pn:alert")
    .setPlaceholder("Canal de alertas")
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(0)
    .setMaxValues(1);
  if (p.alertChannelId && guild.channels.cache.has(p.alertChannelId)) alert.setDefaultChannels(p.alertChannelId);

  const acoes = box()
    .addTextDisplayComponents(
      text(
        [
          "### O que o pânico faz",
          "-# Marque as defesas aplicadas ao clicar em Ativar pânico. Trancar o chat tira de @everyone o envio de mensagens e reações; quem tem cargo com permissão continua falando.",
          p.active ? "-# O pânico está ativo agora: as mudanças valem a partir da próxima ativação." : null,
        ]
          .filter(Boolean)
          .join("\n")
      )
    )
    .addActionRowComponents(
      row(
        new StringSelectMenuBuilder()
          .setCustomId("ar:pn:actions")
          .setPlaceholder("Defesas do pânico")
          .setMinValues(0)
          .setMaxValues(Object.keys(D.PANIC_ACTIONS).length)
          .addOptions(
            Object.entries(D.PANIC_ACTIONS).map(([value, i]) => ({
              label: i.label,
              description: i.desc,
              value,
              default: p.actions.includes(value),
            }))
          )
      )
    );

  const detalhes = box()
    .addTextDisplayComponents(
      text(
        `### Verificação, duração e alertas\n-# O pânico desfaz sozinho depois de **${minutes(p.durationMin)}**. Canal de alertas vazio usa o canal do núcleo.`
      )
    )
    .addActionRowComponents(
      row(
        new StringSelectMenuBuilder()
          .setCustomId("ar:pn:level")
          .setPlaceholder("Verificação durante o pânico")
          .addOptions(
            Object.entries(D.MJ_LEVELS).map(([value, i]) => ({ label: i.label, description: i.desc, value, default: p.level === value }))
          )
      ),
      row(
        new StringSelectMenuBuilder()
          .setCustomId("ar:pn:dur")
          .setPlaceholder("Duração do pânico")
          .addOptions(D.PANIC_DURATIONS.map((n) => ({ label: minutes(n), value: String(n), default: n === p.durationMin })))
      ),
      row(alert)
    );

  return [header("Ajustes do pânico"), acoes, detalhes, backRow("ar:quick", "Voltar")];
}

// ======================= Histórico de incidentes =======================
const encode = (system) => encodeURIComponent(system);

function entryText(i) {
  const when = Math.floor(new Date(i.at).getTime() / 1000);
  const lines = [
    `**${clip(i.system, 60)}${i.action ? ` — ${clip(i.action, 80)}` : ""}**`,
    `-# <t:${when}:f>  ·  <t:${when}:R>`,
  ];
  if (i.authorId) lines.push(`**Autor:** <@${i.authorId}> · \`${i.authorId}\``);
  if (i.channelId) lines.push(`**Canal:** <#${i.channelId}>`);
  for (const f of i.fields ?? []) lines.push(f);
  if (i.content) lines.push(`**Conteúdo:** \`${clip(i.content.replaceAll("`", "'").replace(/\s+/g, " "), 120)}\``);
  return clip(lines.join("\n"), 700);
}

function buildHistoryPanel(guild, data, systems, current) {
  const { items, total, pages, page } = data;
  const sys = current ? encode(current) : "all";

  const head = box().addTextDisplayComponents(
    text(
      [
        "## Histórico de incidentes",
        `**Registros**  \`${total}\`${current ? `  ·  filtro: **${clip(current, 40)}**` : ""}`,
        "-# Cada alerta dos módulos é gravado aqui, do mais recente para o mais antigo. Os registros somem sozinhos depois de 60 dias.",
      ].join("\n")
    )
  );

  const list = box();
  if (!items.length) {
    list.addTextDisplayComponents(text("Nenhum incidente registrado ainda. Os alertas aparecem aqui assim que acontecerem."));
  } else {
    items.forEach((item, index) => {
      if (index) list.addSeparatorComponents(divider());
      list.addTextDisplayComponents(text(entryText(item)));
    });
  }

  const options = [
    { label: "Todos os sistemas", value: "all", default: !current },
    ...systems
      .filter((s) => encode(s).length <= 100)
      .map((s) => ({ label: clip(s, 100), value: encode(s), default: s === current })),
  ].slice(0, 25);

  const controls = box()
    .addActionRowComponents(
      row(new StringSelectMenuBuilder().setCustomId("ar:hi:sys").setPlaceholder("Filtrar por sistema").addOptions(options))
    )
    .addActionRowComponents(
      row(
        btn(`ar:hi:go:${page - 1}:${sys}`, "Anterior").setDisabled(page <= 1),
        btn("ar:hi:page", `Página ${page} de ${pages}`).setDisabled(true),
        btn(`ar:hi:go:${page + 1}:${sys}`, "Próxima").setDisabled(page >= pages)
      )
    );

  return [head, list, controls, backRow("ar:hub", "Voltar")];
}

module.exports = { buildQuickPanel, buildPanicPanel, buildHistoryPanel };
