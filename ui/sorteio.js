const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelType,
} = require("discord.js");
const D = require("../utils/sorteio/defaults");
const { describeRules, formatSpan, unix } = require("../utils/sorteio/render");
const { COLORS, colorLabel } = require("../utils/msgBuilder/store");

// Painéis do /sorteio. Components V2, sem modais: textos e imagens entram pelo chat (utils/sorteio/input.js).
// IDs dos componentes: "sr:<ação>:<sorteio>[:<bloco>...]"

const ACCENT = 0x7c5cff;
const WARN = 0xed4245;

const text = (content) => new TextDisplayBuilder().setContent(String(content).slice(0, 3800));
const clip = (value, max) => {
  const s = String(value ?? "");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};
const box = (color) => {
  const c = new ContainerBuilder();
  if (color != null) c.setAccentColor(color);
  return c;
};
const line = () => new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
const row = (...components) => new ActionRowBuilder().addComponents(...components);
const btn = (id, label, style = ButtonStyle.Secondary, disabled = false) =>
  new ButtonBuilder().setCustomId(id).setLabel(clip(label, 80)).setStyle(style).setDisabled(Boolean(disabled));
const onOff = (value) => (value ? "ligado" : "desligado");
const tag = (value) => `\`${value}\``;

function pick(id, placeholder, options, { max = 1, min = 1, disabled = false } = {}) {
  return row(
    new StringSelectMenuBuilder()
      .setCustomId(id)
      .setPlaceholder(placeholder)
      .setMinValues(min)
      .setMaxValues(Math.min(max, options.length))
      .setDisabled(disabled)
      .addOptions(options.slice(0, 25))
  );
}

const backRow = (id, label = "Voltar") => row(btn(id, label));

// ---------- avisos ----------

function noticeView(title, body, color = ACCENT) {
  return [box(color).addTextDisplayComponents(text(`### ${title}`), text(body))];
}

// ---------- lista ----------

function listView(guild, list) {
  const count = (status) => list.filter((d) => d.status === status).length;

  const head = box(ACCENT).addTextDisplayComponents(
    text("## Central de sorteios"),
    text(
      `Organize quantos sorteios quiser ao mesmo tempo em **${clip(guild.name, 60)}**.\n-# ${count("active")} em andamento · ${count("draft")} rascunho(s) · ${count("ended")} encerrado(s)`
    )
  );

  const body = box().addTextDisplayComponents(
    text(list.length ? "### Seus sorteios\n-# Escolha um para abrir os controles." : "### Seus sorteios\n-# Nada criado por aqui ainda. Comece pelo botão abaixo.")
  );
  if (list.length) {
    body.addActionRowComponents(
      pick(
        "sr:open",
        "Abrir um sorteio",
        list.slice(0, 25).map((d) => ({
          label: clip(d.name, 100),
          description: clip(`${D.STATUS[d.status]} · ${d.prize || "sem prêmio"}`, 100),
          value: String(d._id),
        }))
      )
    );
  }
  body.addActionRowComponents(row(btn("sr:new", "Novo sorteio", ButtonStyle.Success)));
  return [head, body];
}

// ---------- painel do sorteio ----------

function describeEntry(doc) {
  if (doc.entryMode === "reaction") return `reação ${doc.reactionEmoji || "(emoji não definido)"}`;
  return "botão";
}

function homeView(guild, doc) {
  const id = String(doc._id);
  const draft = doc.status === "draft";
  const active = doc.status === "active";
  const ended = doc.status === "ended";
  const rules = describeRules(doc);

  const when = active && doc.endsAt ? `termina <t:${unix(doc.endsAt)}:R>` : ended && doc.endedAt ? `encerrou <t:${unix(doc.endedAt)}:R>` : null;
  const info = [
    `**Prêmio**  ${clip(doc.prize || "não definido", 120)}`,
    `**Vencedores**  ${doc.winners}  ·  **Duração**  ${doc.durationMs ? formatSpan(doc.durationMs) : "não definida"}${when ? `  ·  ${when}` : ""}`,
    `**Canal**  ${doc.channelId ? `<#${doc.channelId}>` : "não escolhido"}  ·  **Entrada**  ${describeEntry(doc)}`,
    `**Inscritos**  ${doc.entries?.length ?? 0}`,
    `**Requisitos**  ${rules.length ? clip(rules.join(" · "), 200) : "nenhum"}  ·  **Chances extras**  ${(doc.extras ?? []).length} cargo(s)`,
  ];
  if (ended) info.push(`**Vencedores sorteados**  ${doc.winnerIds?.length ? doc.winnerIds.map((u) => `<@${u}>`).join(" ") : "ninguém"}`);

  const head = box(ACCENT).addTextDisplayComponents(
    text(`## ${clip(doc.name, 80)}`),
    text(`-# ${D.STATUS[doc.status]}`),
    text(info.join("\n"))
  );

  // Montagem
  const channel = new ChannelSelectMenuBuilder()
    .setCustomId(`sr:ch:${id}`)
    .setPlaceholder("Onde publicar o sorteio")
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(!draft);
  if (doc.channelId && guild.channels.cache.has(doc.channelId)) channel.setDefaultChannels(doc.channelId);

  const montagem = box()
    .addTextDisplayComponents(text("### Montagem\n-# Canal, regras, aparência e forma de entrada."))
    .addActionRowComponents(
      row(channel),
      row(
        btn(`sr:aj:${id}`, "Prêmio e prazo", ButtonStyle.Secondary, ended),
        btn(`sr:rq:${id}`, "Requisitos e chances", ButtonStyle.Secondary, ended),
        btn(`sr:ed:${id}:0`, "Editar mensagem", ButtonStyle.Primary)
      )
    );

  const entryRow = [btn(`sr:em:${id}`, doc.entryMode === "reaction" ? "Entrada: reação" : "Entrada: botão", ButtonStyle.Secondary, !draft)];
  if (doc.entryMode === "reaction") entryRow.push(btn(`sr:emo:${id}`, "Definir emoji", ButtonStyle.Secondary, !draft));
  entryRow.push(btn(`sr:pb:${id}:h`, doc.partButton?.visible === false ? "Inscritos: oculto" : "Inscritos: visível", ButtonStyle.Secondary));

  const entrada = box()
    .addTextDisplayComponents(text("### Como participar\n-# Botão na mensagem ou reação com um emoji. O botão de inscritos mostra quem entrou."))
    .addActionRowComponents(row(...entryRow));

  const entrega = box()
    .addTextDisplayComponents(
      text(`### Aviso ao vencedor\n-# Envio por mensagem privada: **${onOff(doc.dm?.enabled)}**. O anúncio público sempre acontece.`)
    )
    .addActionRowComponents(
      row(
        btn(`sr:dm:${id}`, doc.dm?.enabled ? "Desligar DM" : "Ligar DM", doc.dm?.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
        btn(`sr:dme:${id}`, "Texto da DM"),
        btn(`sr:dmr:${id}`, "Texto padrão")
      )
    );

  const acoes = box(draft ? 0x57f287 : null)
    .addTextDisplayComponents(
      text(
        draft
          ? "### Lançamento\n-# O prazo começa a contar quando você publicar."
          : active
          ? "### Andamento\n-# Mude o prazo, encerre antes da hora ou apague."
          : "### Pós-sorteio\n-# Sorteie novamente se algum vencedor não responder."
      )
    )
    .addActionRowComponents(
      row(
        btn(`sr:pub:${id}`, "Publicar e iniciar", ButtonStyle.Success, !draft),
        btn(`sr:pz:${id}`, "Mudar prazo", ButtonStyle.Secondary, !active),
        btn(`sr:end:${id}`, "Encerrar agora", ButtonStyle.Secondary, !active)
      ),
      row(btn(`sr:rr:${id}`, "Sortear de novo", ButtonStyle.Secondary, !ended), btn(`sr:del:${id}`, "Excluir", ButtonStyle.Danger))
    );

  return [head, montagem, entrada, entrega, acoes, row(btn("sr:list", "Todos os sorteios"), btn(`sr:prev:${id}`, "Prévia"), btn(`sr:home:${id}`, "Atualizar"))];
}

// ---------- prêmio, vencedores e prazo ----------

function ajustesView(doc) {
  const id = String(doc._id);
  const draft = doc.status === "draft";
  const winners = D.WINNER_OPTIONS.includes(doc.winners) ? D.WINNER_OPTIONS : [...D.WINNER_OPTIONS, doc.winners].sort((a, b) => a - b);

  const main = box(ACCENT)
    .addTextDisplayComponents(
      text("### Prêmio, vencedores e prazo"),
      text(
        [
          `**Nome interno**  ${clip(doc.name, 80)}`,
          `**Prêmio**  ${clip(doc.prize || "não definido", 120)}`,
          `**Vencedores**  ${doc.winners}`,
          `**Duração**  ${doc.durationMs ? formatSpan(doc.durationMs) : "não definida"}`,
          draft ? "-# O prazo começa ao publicar." : "-# Para mudar o prazo de um sorteio em andamento, use \"Mudar prazo\" no painel.",
        ].join("\n")
      )
    )
    .addActionRowComponents(
      row(btn(`sr:ajn:${id}`, "Trocar apelido"), btn(`sr:ajm:${id}`, "Editar prêmio e prazo")),
      pick(
        `sr:ajw:${id}`,
        "Quantos vencedores",
        winners.map((n) => ({ label: `${n} vencedor${n === 1 ? "" : "es"}`, value: String(n), default: n === doc.winners }))
      )
    );

  if (draft) {
    main.addActionRowComponents(
      pick(
        `sr:ajdu:${id}`,
        "Duração do sorteio",
        D.DURATION_OPTIONS.map((o) => ({ label: o.label, value: String(o.ms), default: o.ms === doc.durationMs }))
      )
    );
  }
  return [main, backRow(`sr:home:${id}`)];
}

// ---------- requisitos e chances ----------

function requisitosView(doc) {
  const id = String(doc._id);
  const r = doc.req;
  const lines = [
    `**Atividade**  ${[r.callMin ? `${r.callMin} min em call` : null, r.messages ? `${r.messages} mensagens` : null, r.invites ? `${r.invites} convites` : null].filter(Boolean).join(" · ") || "sem mínimo"}`,
    `**Perfil**  ${r.where?.length ? r.where.map((w) => D.WHERE[w]?.label).filter(Boolean).join(" ou ") : "sem exigência"}`,
    `**Chances extras**  ${(doc.extras ?? []).length} cargo(s)`,
    `**Monitor**  ${onOff(r.monitor)}`,
    "-# O monitor tira da lista quem sai do servidor ou deixa de cumprir a exigência de perfil.",
  ];
  return [
    box(ACCENT)
      .addTextDisplayComponents(text("### Quem pode entrar"), text(lines.join("\n")))
      .addActionRowComponents(
        row(btn(`sr:rqa:${id}`, "Atividade"), btn(`sr:rqp:${id}`, "Perfil"), btn(`sr:rqx:${id}`, "Chances extras")),
        row(btn(`sr:rqm:${id}`, r.monitor ? "Desligar monitor" : "Ligar monitor", r.monitor ? ButtonStyle.Danger : ButtonStyle.Success))
      ),
    backRow(`sr:home:${id}`),
  ];
}

function atividadeView(doc) {
  const id = String(doc._id);
  const r = doc.req;
  const opts = (list, current, fmt) => {
    const values = list.includes(current) ? list : [...list, current].sort((a, b) => a - b);
    return values.map((n) => ({ label: n === 0 ? "Sem mínimo" : fmt(n), value: String(n), default: n === current }));
  };
  const minutes = (n) => (n >= 60 && n % 60 === 0 ? `${n / 60} h em call` : `${n} min em call`);

  return [
    box(ACCENT)
      .addTextDisplayComponents(
        text("### Mínimos de atividade"),
        text("-# Os números vêm do que o bot registra no servidor: mensagens enviadas, minutos em canal de voz e convites usados. A contagem começa quando o bot passa a acompanhar.")
      )
      .addActionRowComponents(
        pick(`sr:rqc:${id}`, "Tempo em call", opts(D.CALL_OPTIONS, r.callMin, minutes)),
        pick(`sr:rqmsg:${id}`, "Mensagens enviadas", opts(D.MESSAGE_OPTIONS, r.messages, (n) => `${n} mensagens`)),
        pick(`sr:rqi:${id}`, "Convites", opts(D.INVITE_OPTIONS, r.invites, (n) => `${n} convite${n === 1 ? "" : "s"}`))
      ),
    backRow(`sr:rq:${id}`),
  ];
}

function perfilView(doc) {
  const id = String(doc._id);
  const r = doc.req;
  const statusNeedsPatterns = r.where?.includes("status") && !r.where.includes("tag") && !(r.patterns ?? []).length;
  return [
    box(ACCENT)
      .addTextDisplayComponents(
        text("### Exigência de perfil"),
        text(
          [
            `**Padrões**  ${r.patterns?.length ? r.patterns.map(tag).join(" ") : "nenhum"}`,
            `**Onde procurar**  ${r.where?.length ? r.where.map((w) => D.WHERE[w]?.label).filter(Boolean).join(" ou ") : "nenhum lugar marcado"}`,
            "-# Basta bater em um dos lugares marcados. O status precisa dos padrões; a tag do servidor não.",
            statusNeedsPatterns ? "**Atenção**  o status está marcado, mas sem padrões. Defina os padrões ou desmarque." : null,
          ]
            .filter(Boolean)
            .join("\n")
        )
      )
      .addActionRowComponents(
        pick(
          `sr:rqw:${id}`,
          "Onde procurar",
          Object.entries(D.WHERE).map(([value, i]) => ({ label: i.label, description: i.desc, value, default: r.where?.includes(value) })),
          { max: 2, min: 0 }
        ),
        row(btn(`sr:rqpp:${id}`, "Editar exigência"), btn(`sr:rqpc:${id}`, "Limpar padrões", ButtonStyle.Secondary, !r.patterns?.length))
      ),
    backRow(`sr:rq:${id}`),
  ];
}

function extrasView(guild, doc) {
  const id = String(doc._id);
  const extras = (doc.extras ?? []).filter((e) => e.roleId);
  const roleName = (roleId) => guild.roles.cache.get(roleId)?.name ?? `cargo ${roleId}`;

  const main = box(ACCENT)
    .addTextDisplayComponents(
      text("### Chances extras por cargo"),
      text(
        extras.length
          ? extras.map((e) => `<@&${e.roleId}>  +${e.extra} entrada${e.extra === 1 ? "" : "s"}`).join("\n")
          : "-# Nenhum cargo com bônus. Quem tem o cargo ganha bilhetes a mais no sorteio."
      )
    )
    .addActionRowComponents(
      row(new RoleSelectMenuBuilder().setCustomId(`sr:exa:${id}`).setPlaceholder("Adicionar cargo com bônus").setMinValues(1).setMaxValues(1))
    );
  if (extras.length) {
    main.addActionRowComponents(
      pick(
        `sr:exp:${id}`,
        "Ajustar um cargo",
        extras.slice(0, 25).map((e) => ({ label: clip(roleName(e.roleId), 100), description: `+${e.extra} entrada(s)`, value: e.roleId }))
      )
    );
  }
  return [main, backRow(`sr:rq:${id}`)];
}

function extraEditView(guild, doc, roleId) {
  const id = String(doc._id);
  const entry = (doc.extras ?? []).find((e) => e.roleId === roleId);
  if (!entry) return extrasView(guild, doc);
  return [
    box(ACCENT)
      .addTextDisplayComponents(text(`### Bônus de <@&${roleId}>`), text(`Hoje: **+${entry.extra}** entrada(s) para quem tem esse cargo.`))
      .addActionRowComponents(
        pick(
          `sr:exq:${id}:${roleId}`,
          "Quantas entradas a mais",
          D.EXTRA_OPTIONS.map((n) => ({ label: `+${n} entrada${n === 1 ? "" : "s"}`, value: String(n), default: n === entry.extra }))
        ),
        row(btn(`sr:exd:${id}:${roleId}`, "Remover cargo", ButtonStyle.Danger))
      ),
    backRow(`sr:rqx:${id}`),
  ];
}

// ---------- editor da mensagem ----------

const blockIndex = (doc, b) => Math.min(Math.max(Number(b) || 0, 0), doc.blocks.length - 1);

function editorView(doc, b) {
  const id = String(doc._id);
  const i = blockIndex(doc, b);
  const block = doc.blocks[i];

  const head = box(ACCENT).addTextDisplayComponents(
    text("## Editor da mensagem"),
    text(
      `-# Bloco ${i + 1} de ${doc.blocks.length} · formato ${D.LAYOUTS[doc.layout]?.label.toLowerCase()} · cor ${colorLabel(block.color)} · imagem ${block.image ? "sim" : "não"}`
    )
  );

  const blocks = box()
    .addTextDisplayComponents(text(`### Blocos\n-# Até ${D.LIMITS.blocks}. Cada bloco é uma caixa com texto, imagem e cor própria.`))
    .addActionRowComponents(
      pick(
        `sr:edb:${id}`,
        "Escolher o bloco",
        doc.blocks.map((blk, n) => ({
          label: `Bloco ${n + 1}`,
          description: clip(String(blk.text || "vazio").replace(/\s+/g, " "), 90),
          value: String(n),
          default: n === i,
        }))
      ),
      row(
        btn(`sr:eda:${id}`, "Adicionar bloco", ButtonStyle.Success, doc.blocks.length >= D.LIMITS.blocks),
        btn(`sr:edr:${id}:${i}`, "Remover este bloco", ButtonStyle.Danger, doc.blocks.length <= 1)
      )
    );

  const parts = box()
    .addTextDisplayComponents(text(`### Bloco ${i + 1}\n-# Escolha o que mudar neste bloco.`))
    .addActionRowComponents(
      row(btn(`sr:ct:${id}:${i}`, "Texto"), btn(`sr:md:${id}:${i}`, "Imagens"), btn(`sr:ap:${id}:${i}`, "Aparência"), btn(`sr:it:${id}:${i}`, "Botões"))
    );

  return [head, blocks, parts, row(btn(`sr:home:${id}`, "Voltar ao sorteio"), btn(`sr:prev:${id}`, "Prévia"))];
}

function conteudoView(doc, b) {
  const id = String(doc._id);
  const i = blockIndex(doc, b);
  const current = String(doc.blocks[i].text || "").replace(/```/g, "'''");
  return [
    box(ACCENT)
      .addTextDisplayComponents(
        text(`### Texto do bloco ${i + 1}`),
        text("Aceita Markdown do Discord. As variáveis abaixo são trocadas na hora de publicar:"),
        text(D.VARIABLES.map(([v, d]) => `\`${v}\`  ${d}`).join("\n")),
        text("-# `[separador]` desenha uma linha fina e `[separador_largo]` deixa um espaço maior."),
        text(`**Texto atual**\n\`\`\`\n${clip(current || "(vazio)", 900)}\n\`\`\``)
      )
      .addActionRowComponents(row(btn(`sr:cte:${id}:${i}`, "Escrever texto", ButtonStyle.Primary), btn(`sr:ctr:${id}:${i}`, "Modelo padrão")))
      .addActionRowComponents(row(btn(`sr:prev:${id}`, "Prévia"))),
    backRow(`sr:ed:${id}:${i}`, "Voltar ao editor"),
  ];
}

function midiaView(doc, b) {
  const id = String(doc._id);
  const i = blockIndex(doc, b);
  const block = doc.blocks[i];
  const state = (v) => (v ? (String(v).startsWith("db:") ? "imagem guardada" : "link") : "vazia");
  return [
    box(ACCENT)
      .addTextDisplayComponents(
        text(`### Imagens do bloco ${i + 1}`),
        text(`**Imagem principal**  ${state(block.image)}\n**Miniatura**  ${state(block.thumb)}`),
        text("-# Envie um arquivo (png, jpg, gif ou webp, até 4 MB) ou cole um link. A miniatura aparece ao lado do primeiro trecho de texto.")
      )
      .addActionRowComponents(
        row(btn(`sr:mdi:${id}:${i}`, "Enviar imagem", ButtonStyle.Primary), btn(`sr:mdx:${id}:${i}:i`, "Tirar imagem", ButtonStyle.Secondary, !block.image)),
        row(btn(`sr:mdt:${id}:${i}`, "Enviar miniatura", ButtonStyle.Primary), btn(`sr:mdx:${id}:${i}:t`, "Tirar miniatura", ButtonStyle.Secondary, !block.thumb))
      ),
    backRow(`sr:ed:${id}:${i}`, "Voltar ao editor"),
  ];
}

function aparenciaView(doc, b) {
  const id = String(doc._id);
  const i = blockIndex(doc, b);
  const block = doc.blocks[i];
  const colors = [{ label: "Sem cor", value: "none", default: !block.color }];
  for (const [key, c] of Object.entries(COLORS)) colors.push({ label: c.label, value: key, default: block.color === key });
  return [
    box(ACCENT)
      .addTextDisplayComponents(
        text(`### Aparência do bloco ${i + 1}`),
        text(
          [
            `**Formato**  ${D.LAYOUTS[doc.layout]?.label} (vale para a mensagem toda)`,
            `**Cor**  ${colorLabel(block.color)}`,
            `**Espaço grande antes da imagem**  ${block.wide ? "sim" : "não"}`,
          ].join("\n")
        )
      )
      .addActionRowComponents(
        pick(
          `sr:apf:${id}:${i}`,
          "Formato da mensagem",
          Object.entries(D.LAYOUTS).map(([value, l]) => ({ label: l.label, description: l.desc, value, default: doc.layout === value }))
        ),
        pick(`sr:apk:${id}:${i}`, "Cor do bloco", colors),
        row(btn(`sr:apc:${id}:${i}`, "Cor em hexadecimal"), btn(`sr:apw:${id}:${i}`, block.wide ? "Espaço grande: sim" : "Espaço grande: não"))
      ),
    backRow(`sr:ed:${id}:${i}`, "Voltar ao editor"),
  ];
}

function interacoesView(doc, b) {
  const id = String(doc._id);
  const i = blockIndex(doc, b);
  return [
    box(ACCENT)
      .addTextDisplayComponents(
        text("### Botões da mensagem"),
        text(
          [
            "**Botão de entrada**  texto, emoji, cor e posição.",
            "**Botão de inscritos**  mostra a lista de quem entrou.",
            "-# Os botões ficam no último bloco que tem conteúdo, ou abaixo da caixa, conforme a posição.",
          ].join("\n")
        )
      )
      .addActionRowComponents(row(btn(`sr:bt:${id}:${i}:main`, "Botão de entrada"), btn(`sr:bt:${id}:${i}:part`, "Botão de inscritos"))),
    backRow(`sr:ed:${id}:${i}`, "Voltar ao editor"),
  ];
}

function botaoView(doc, b, which) {
  const id = String(doc._id);
  const i = blockIndex(doc, b);
  const main = which === "main";
  const spec = main ? doc.mainButton : doc.partButton;
  const colors = Object.entries(D.BUTTON_COLORS).map(([value, label]) => ({ label, value, default: spec.style === value }));
  const defaultLabel = main ? D.DEFAULT_MAIN_LABEL : D.DEFAULT_PART_LABEL;

  const info = [
    `**Texto**  ${spec.label ? tag(clip(spec.label, 60)) : `padrão (${tag(defaultLabel)})`}`,
    `**Emoji**  ${spec.emoji ? spec.emoji : "nenhum"}`,
    `**Cor**  ${D.BUTTON_COLORS[spec.style] ?? "Cinza"}`,
    main ? `**Posição**  ${D.PLACES[doc.place]?.label}` : `**Visível**  ${spec.visible === false ? "não" : "sim"}`,
    "-# Use `{participantes}` no texto para mostrar o total de inscritos.",
    main && doc.entryMode === "reaction" ? "-# Com entrada por reação o botão de entrada não aparece na mensagem." : null,
  ].filter(Boolean);

  const panel = box(ACCENT)
    .addTextDisplayComponents(text(main ? "### Botão de entrada" : "### Botão de inscritos"), text(info.join("\n")))
    .addActionRowComponents(
      row(
        btn(`sr:btm:${id}:${i}:${which}`, "Editar botão", ButtonStyle.Primary),
        btn(`sr:btx:${id}:${i}:${which}`, "Tirar emoji", ButtonStyle.Secondary, !spec.emoji)
      ),
      pick(`sr:btc:${id}:${i}:${which}`, "Cor do botão", colors)
    );

  if (main) {
    panel.addActionRowComponents(
      pick(
        `sr:btp:${id}:${i}`,
        "Posição dos botões",
        Object.entries(D.PLACES).map(([value, p]) => ({ label: p.label, description: p.desc, value, default: doc.place === value }))
      )
    );
  } else {
    panel.addActionRowComponents(row(btn(`sr:pb:${id}:${i}`, spec.visible === false ? "Mostrar botão" : "Esconder botão", spec.visible === false ? ButtonStyle.Success : ButtonStyle.Secondary)));
  }
  return [panel, backRow(`sr:it:${id}:${i}`, "Voltar aos botões")];
}

// ---------- prazo, exclusão ----------

function prazoView(doc) {
  const id = String(doc._id);
  return [
    box(ACCENT)
      .addTextDisplayComponents(
        text("### Mudar o prazo"),
        text(`Termina hoje <t:${unix(doc.endsAt)}:R>.\n-# O novo prazo conta a partir de agora, não do começo do sorteio.`)
      )
      .addActionRowComponents(
        pick(`sr:pzs:${id}`, "Terminar daqui a...", D.DURATION_OPTIONS.map((o) => ({ label: o.label, value: String(o.ms) }))),
        row(btn(`sr:pzx:${id}`, "Outro prazo"))
      ),
    backRow(`sr:home:${id}`),
  ];
}

function deleteView(doc) {
  const id = String(doc._id);
  return [
    box(WARN)
      .addTextDisplayComponents(
        text(`### Apagar "${clip(doc.name, 60)}"?`),
        text(doc.status === "active" ? "O sorteio está em andamento: a mensagem pública também será apagada e ninguém será sorteado." : "O sorteio e as imagens dele serão apagados de vez.")
      )
      .addActionRowComponents(row(btn(`sr:delok:${id}`, "Apagar de vez", ButtonStyle.Danger), btn(`sr:home:${id}`, "Manter"))),
  ];
}

// ---------- lista de inscritos (botão público) ----------

const PAGE = 20;

function inscritosView(doc, page) {
  const total = doc.entries.length;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const p = Math.min(Math.max(Number(page) || 0, 0), pages - 1);
  const slice = doc.entries.slice(p * PAGE, p * PAGE + PAGE);
  const view = box(ACCENT).addTextDisplayComponents(
    text(`### Inscritos em ${clip(doc.name, 60)}`),
    text(slice.length ? slice.map((e, n) => `${p * PAGE + n + 1}. <@${e.userId}>`).join("\n") : "-# Ninguém entrou ainda."),
    text(`-# ${total} inscrito(s) · página ${p + 1} de ${pages}`)
  );
  if (pages > 1) {
    view.addActionRowComponents(row(btn(`sr:pl:${doc._id}:${p - 1}`, "Anterior", ButtonStyle.Secondary, p === 0), btn(`sr:pl:${doc._id}:${p + 1}`, "Próxima", ButtonStyle.Secondary, p >= pages - 1)));
  }
  return [view];
}

function leaveView(doc) {
  return [
    box(ACCENT)
      .addTextDisplayComponents(text("### Você já está dentro"), text(`Sua inscrição em **${clip(doc.name, 60)}** está valendo. Quer sair da disputa?`))
      .addActionRowComponents(row(btn(`sr:leave:${doc._id}`, "Sair do sorteio", ButtonStyle.Danger))),
  ];
}

module.exports = {
  noticeView,
  listView,
  homeView,
  ajustesView,
  requisitosView,
  atividadeView,
  perfilView,
  extrasView,
  extraEditView,
  editorView,
  conteudoView,
  midiaView,
  aparenciaView,
  interacoesView,
  botaoView,
  prazoView,
  deleteView,
  inscritosView,
  leaveView,
  blockIndex,
};
