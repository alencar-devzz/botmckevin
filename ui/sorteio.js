const {
  ContainerBuilder,
  SectionBuilder,
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
// Embeds sem cor de destaque; linhas de ação únicas usam Section (texto + botão "accessory" à direita).

const EMOJI = {
  pencil: "<:pencil:1571748457423831191>",
  send: "<:send:1571748543600005200>",
  back: "<:return:1571748566714679456>",
  home: "<:home:1570991310612201482>",
  hashtag: "<:hashtag:1570940895115616276>",
  clock: "<:clock:1570940810617298954>",
  settings: "<:settings:1570940544614539264>",
  member: "<:member:1570579495746937002>",
  more: "<:more:1571750505426845810>",
  reload: "<a:reload:1569724363954065498>",
  reload2: "<:reload2:1570940328880373810>",
  lupa: "<:lupa:1569386560107970755>",
  on: "<:onn:1571764142757650484>",
  off: "<:offf:1571764644383825990>",
  trash: "<:trash:1571750967094022154>",
};

const text = (content) => new TextDisplayBuilder().setContent(String(content).slice(0, 3800));
const clip = (value, max) => {
  const s = String(value ?? "");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};
const box = () => new ContainerBuilder();
const line = () => new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
const row = (...components) => new ActionRowBuilder().addComponents(...components);

const btn = (id, label, style = ButtonStyle.Secondary, disabled = false, emoji = null) => {
  const b = new ButtonBuilder().setCustomId(id).setStyle(style).setDisabled(Boolean(disabled));
  if (label) b.setLabel(clip(label, 80));
  if (emoji) b.setEmoji(emoji);
  return b;
};

// Botão só com ícone, para usar como accessory de uma Section.
const iconBtn = (id, emoji, style = ButtonStyle.Secondary, disabled = false) =>
  new ButtonBuilder().setCustomId(id).setEmoji(emoji).setStyle(style).setDisabled(Boolean(disabled));

// Section: texto à esquerda + um botão "accessory" à direita (como nos painéis originais).
const section = (accessory, ...contents) => {
  const s = new SectionBuilder().setButtonAccessory(accessory);
  for (const c of contents) s.addTextDisplayComponents(c instanceof TextDisplayBuilder ? c : text(c));
  return s;
};

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

const backRow = (id, label = "Voltar") => row(btn(id, label, ButtonStyle.Secondary, false, EMOJI.back));

// ---------- avisos ----------

function noticeView(title, body) {
  return [box().addTextDisplayComponents(text(`### ${title}`), text(body))];
}

// ---------- lista ----------

function listView(guild, list) {
  const count = (status) => list.filter((d) => d.status === status).length;

  const head = box().addTextDisplayComponents(
    text(`## ${EMOJI.home} Central de sorteios`),
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
  body.addActionRowComponents(row(btn("sr:new", "Novo sorteio", ButtonStyle.Success, false, EMOJI.more)));
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
    `${EMOJI.member} **Vencedores**  ${doc.winners}  ·  ${EMOJI.clock} **Duração**  ${doc.durationMs ? formatSpan(doc.durationMs) : "não definida"}${when ? `  ·  ${when}` : ""}`,
    `${EMOJI.hashtag} **Canal**  ${doc.channelId ? `<#${doc.channelId}>` : "não escolhido"}  ·  **Entrada**  ${describeEntry(doc)}`,
    `${EMOJI.member} **Inscritos**  ${doc.entries?.length ?? 0}`,
    `**Requisitos**  ${rules.length ? clip(rules.join(" · "), 200) : "nenhum"}  ·  **Chances extras**  ${(doc.extras ?? []).length} cargo(s)`,
  ];
  if (ended) info.push(`${EMOJI.member} **Vencedores sorteados**  ${doc.winnerIds?.length ? doc.winnerIds.map((u) => `<@${u}>`).join(" ") : "ninguém"}`);

  const head = box().addTextDisplayComponents(text(`## ${clip(doc.name, 80)}`), text(`-# ${D.STATUS[doc.status]}`), text(info.join("\n")));

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
    .addTextDisplayComponents(text(`### ${EMOJI.settings} Montagem\n-# Canal, regras, aparência e forma de entrada.`))
    .addActionRowComponents(row(channel))
    .addSectionComponents(
      section(btn(`sr:aj:${id}`, "Editar", ButtonStyle.Secondary, ended, EMOJI.pencil), "**Prêmio e prazo**\n-# Nome interno, prêmio, vencedores e duração."),
      section(btn(`sr:rq:${id}`, "Editar", ButtonStyle.Secondary, ended, EMOJI.pencil), "**Requisitos e chances**\n-# Quem pode participar e cargos com bônus."),
      section(btn(`sr:ed:${id}:0`, "Editar", ButtonStyle.Primary, false, EMOJI.pencil), "**Editar mensagem**\n-# Texto, imagens e botões da mensagem publicada."),
      section(btn(`sr:en:${id}`, "Abrir", ButtonStyle.Secondary, false, EMOJI.pencil), `**Entrada e inscritos**\n-# Participação por ${doc.entryMode === "reaction" ? "reação" : "botão"} e botão de inscritos.`),
      section(btn(`sr:en:${id}:dm`, "Abrir", ButtonStyle.Secondary, false, EMOJI.pencil), `**Aviso ao vencedor**\n-# Mensagem privada: ${onOff(doc.dm?.enabled)}.`)
    );

  const acoes = box().addTextDisplayComponents(
    text(
      draft
        ? "### Lançamento\n-# O prazo começa a contar quando você publicar."
        : active
        ? "### Andamento\n-# Mude o prazo, encerre antes da hora ou apague."
        : "### Pós-sorteio\n-# Sorteie novamente se algum vencedor não responder."
    )
  );
  acoes.addActionRowComponents(
    row(
      btn(`sr:pub:${id}`, "Publicar", ButtonStyle.Success, !draft, EMOJI.send),
      btn(`sr:pz:${id}`, "Mudar prazo", ButtonStyle.Secondary, !active, EMOJI.clock),
      btn(`sr:end:${id}`, "Encerrar", ButtonStyle.Secondary, !active),
      btn(`sr:rr:${id}`, "Sortear de novo", ButtonStyle.Secondary, !ended, EMOJI.reload2),
      btn(`sr:del:${id}`, "Excluir", ButtonStyle.Danger, false, EMOJI.trash)
    )
  );

  return [
    head,
    montagem,
    acoes,
    row(
      btn("sr:list", "Todos os sorteios", ButtonStyle.Secondary, false, EMOJI.back),
      btn(`sr:prev:${id}`, "Prévia", ButtonStyle.Secondary, false, EMOJI.lupa),
      btn(`sr:home:${id}`, "Atualizar", ButtonStyle.Secondary, false, EMOJI.reload)
    ),
  ];
}

function entregaView(guild, doc) {
  const id = String(doc._id);
  const draft = doc.status === "draft";
  const head = box().addTextDisplayComponents(text(`## ${clip(doc.name, 80)}`), text("-# Entrada e aviso ao vencedor"));

  const entrada = box().addTextDisplayComponents(text(`### Como participar\n-# Botão na mensagem ou reação com um emoji. O botão de inscritos mostra quem entrou.`));
  entrada.addSectionComponents(
    section(
      btn(`sr:em:${id}`, doc.entryMode === "reaction" ? "Entrada: reação" : "Entrada: botão", ButtonStyle.Secondary, !draft),
      "**Forma de entrada**\n-# Escolha como as pessoas se inscrevem."
    )
  );
  if (doc.entryMode === "reaction") {
    entrada.addSectionComponents(section(btn(`sr:emo:${id}`, "Definir", ButtonStyle.Secondary, !draft, EMOJI.more), "**Emoji da reação**\n-# Qual emoji conta como inscrição."));
  }
  entrada.addSectionComponents(
    section(
      btn(`sr:pb:${id}:h`, doc.partButton?.visible === false ? "Inscritos: oculto" : "Inscritos: visível", ButtonStyle.Secondary, false),
      "**Botão de inscritos**\n-# Mostra ou esconde quem já entrou."
    )
  );

  const entrega = box().addTextDisplayComponents(text(`### Aviso ao vencedor\n-# Envio por mensagem privada: **${onOff(doc.dm?.enabled)}**. O anúncio público sempre acontece.`));
  entrega.addSectionComponents(
    section(
      btn(`sr:dm:${id}`, doc.dm?.enabled ? "Desligar DM" : "Ligar DM", doc.dm?.enabled ? ButtonStyle.Danger : ButtonStyle.Success, false, doc.dm?.enabled ? EMOJI.off : EMOJI.on),
      "**Aviso por DM**\n-# Liga ou desliga o envio por mensagem privada."
    ),
    section(btn(`sr:dme:${id}`, "Escrever", ButtonStyle.Secondary, false, EMOJI.pencil), "**Texto da DM**\n-# Mensagem enviada a quem ganhar."),
    section(btn(`sr:dmr:${id}`, "Restaurar", ButtonStyle.Secondary, false, EMOJI.reload), "**Texto padrão**\n-# Volta ao modelo original da DM.")
  );

  return [head, entrada, entrega, row(btn(`sr:home:${id}`, "Voltar ao sorteio", ButtonStyle.Secondary, false, EMOJI.back))];
}

// ---------- prêmio, vencedores e prazo ----------

function ajustesView(doc) {
  const id = String(doc._id);
  const draft = doc.status === "draft";
  const winners = D.WINNER_OPTIONS.includes(doc.winners) ? D.WINNER_OPTIONS : [...D.WINNER_OPTIONS, doc.winners].sort((a, b) => a - b);

  const main = box().addTextDisplayComponents(
    text("### Prêmio, vencedores e prazo"),
    text(
      [
        `**Nome interno**  ${clip(doc.name, 80)}`,
        `**Prêmio**  ${clip(doc.prize || "não definido", 120)}`,
        `${EMOJI.member} **Vencedores**  ${doc.winners}`,
        `${EMOJI.clock} **Duração**  ${doc.durationMs ? formatSpan(doc.durationMs) : "não definida"}`,
        draft ? "-# O prazo começa ao publicar." : "-# Para mudar o prazo de um sorteio em andamento, use \"Mudar prazo\" no painel.",
      ].join("\n")
    )
  );

  main.addSectionComponents(
    section(btn(`sr:ajn:${id}`, "Trocar", ButtonStyle.Secondary, false, EMOJI.more), "**Apelido**\n-# Nome interno deste sorteio (só você vê)."),
    section(btn(`sr:ajm:${id}`, "Editar", ButtonStyle.Secondary, false, EMOJI.more), "**Prêmio e prazo**\n-# O que será sorteado e por quanto tempo.")
  );

  main.addActionRowComponents(
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
    `${EMOJI.member} **Chances extras**  ${(doc.extras ?? []).length} cargo(s)`,
    `**Monitor**  ${onOff(r.monitor)}`,
    "-# O monitor tira da lista quem sai do servidor ou deixa de cumprir a exigência de perfil.",
  ];
  const main = box().addTextDisplayComponents(text(`### ${EMOJI.settings} Quem pode entrar`), text(lines.join("\n")));
  main.addSectionComponents(
    section(btn(`sr:rqa:${id}`, "Editar", ButtonStyle.Secondary, false, EMOJI.more), "**Atividade no servidor**\n-# Mensagens, call e convites mínimos."),
    section(btn(`sr:rqp:${id}`, "Editar", ButtonStyle.Secondary, false, EMOJI.more), "**Perfil do membro**\n-# Exige um padrão na bio, status, pronomes ou tag."),
    section(btn(`sr:rqx:${id}`, "Gerenciar", ButtonStyle.Secondary, false, EMOJI.more), "**Entradas extras**\n-# Cargos que ganham bilhetes a mais."),
    section(
      btn(`sr:rqm:${id}`, r.monitor ? "Desligar" : "Ligar", r.monitor ? ButtonStyle.Danger : ButtonStyle.Success, false, r.monitor ? EMOJI.trash : EMOJI.send),
      "**Monitor de requisitos**\n-# Remove quem deixar de cumprir."
    )
  );
  return [main, backRow(`sr:home:${id}`)];
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
    box()
      .addTextDisplayComponents(
        text(`### ${EMOJI.clock} Mínimos de atividade`),
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
  const main = box().addTextDisplayComponents(
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
  );
  main.addActionRowComponents(
    pick(
      `sr:rqw:${id}`,
      "Onde procurar",
      Object.entries(D.WHERE).map(([value, i]) => ({ label: i.label, description: i.desc, value, default: r.where?.includes(value) })),
      { max: 2, min: 0 }
    )
  );
  main.addSectionComponents(
    section(btn(`sr:rqpp:${id}`, "Editar", ButtonStyle.Secondary, false, EMOJI.more), "**Padrões exigidos**\n-# URL ou palavra que precisa aparecer."),
    section(btn(`sr:rqpc:${id}`, "Limpar", ButtonStyle.Secondary, !r.patterns?.length, EMOJI.trash), "**Limpar padrões**\n-# Remove tudo o que foi definido.")
  );
  return [main, backRow(`sr:rq:${id}`)];
}

function extrasView(guild, doc) {
  const id = String(doc._id);
  const extras = (doc.extras ?? []).filter((e) => e.roleId);
  const roleName = (roleId) => guild.roles.cache.get(roleId)?.name ?? `cargo ${roleId}`;

  const main = box()
    .addTextDisplayComponents(
      text(`### ${EMOJI.member} Chances extras por cargo`),
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
  const main = box().addTextDisplayComponents(text(`### Bônus de <@&${roleId}>`), text(`Hoje: **+${entry.extra}** entrada(s) para quem tem esse cargo.`));
  main.addActionRowComponents(
    pick(
      `sr:exq:${id}:${roleId}`,
      "Quantas entradas a mais",
      D.EXTRA_OPTIONS.map((n) => ({ label: `+${n} entrada${n === 1 ? "" : "s"}`, value: String(n), default: n === entry.extra }))
    )
  );
  main.addSectionComponents(section(btn(`sr:exd:${id}:${roleId}`, "Remover", ButtonStyle.Danger, false, EMOJI.trash), "**Remover cargo**\n-# Tira o bônus deste cargo."));
  return [main, backRow(`sr:rqx:${id}`)];
}

// ---------- editor da mensagem ----------

const blockIndex = (doc, b) => Math.min(Math.max(Number(b) || 0, 0), doc.blocks.length - 1);

function editorView(doc, b) {
  const id = String(doc._id);
  const i = blockIndex(doc, b);
  const block = doc.blocks[i];

  const head = box().addTextDisplayComponents(
    text(`## ${EMOJI.hashtag} Editor da mensagem`),
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
      )
    );
  blocks.addSectionComponents(
    section(btn(`sr:eda:${id}`, "Adicionar", ButtonStyle.Success, doc.blocks.length >= D.LIMITS.blocks, EMOJI.more), "**Novo bloco**\n-# Acrescenta mais uma caixa à mensagem."),
    section(btn(`sr:edr:${id}:${i}`, "Remover", ButtonStyle.Danger, doc.blocks.length <= 1, EMOJI.trash), "**Remover este bloco**\n-# Apaga o bloco selecionado.")
  );

  const parts = box().addTextDisplayComponents(text(`### Bloco ${i + 1}\n-# Escolha o que mudar neste bloco.`));
  parts.addSectionComponents(
    section(iconBtn(`sr:ct:${id}:${i}`, EMOJI.pencil), "**Texto**\n-# Conteúdo e variáveis do bloco."),
    section(iconBtn(`sr:md:${id}:${i}`, EMOJI.pencil), "**Imagens**\n-# Imagem principal e miniatura."),
    section(iconBtn(`sr:ap:${id}:${i}`, EMOJI.pencil), "**Aparência**\n-# Formato, cor e espaçamento."),
    section(iconBtn(`sr:it:${id}:${i}`, EMOJI.pencil), "**Botões**\n-# Botão de entrada e de inscritos.")
  );

  return [
    head,
    blocks,
    parts,
    row(btn(`sr:home:${id}`, "Voltar ao sorteio", ButtonStyle.Secondary, false, EMOJI.back), btn(`sr:prev:${id}`, "Prévia", ButtonStyle.Secondary, false, EMOJI.lupa)),
  ];
}

function conteudoView(doc, b) {
  const id = String(doc._id);
  const i = blockIndex(doc, b);
  const current = String(doc.blocks[i].text || "").replace(/```/g, "'''");
  return [
    box()
      .addTextDisplayComponents(
        text(`### ${EMOJI.pencil} Texto do bloco ${i + 1}`),
        text("Aceita Markdown do Discord. As variáveis abaixo são trocadas na hora de publicar:"),
        text(D.VARIABLES.map(([v, d]) => `\`${v}\`  ${d}`).join("\n")),
        text("-# `[separador]` desenha uma linha fina e `[separador_largo]` deixa um espaço maior."),
        text(`**Texto atual**\n\`\`\`\n${clip(current || "(vazio)", 900)}\n\`\`\``)
      )
      .addSectionComponents(
        section(btn(`sr:cte:${id}:${i}`, "Editar", ButtonStyle.Primary, false, EMOJI.pencil), "**Escrever texto**\n-# Envie o novo texto no chat."),
        section(btn(`sr:ctr:${id}:${i}`, "Restaurar", ButtonStyle.Secondary, false, EMOJI.reload), "**Modelo padrão**\n-# Volta ao texto original do bloco.")
      )
      .addActionRowComponents(row(btn(`sr:prev:${id}`, "Prévia", ButtonStyle.Secondary, false, EMOJI.lupa))),
    backRow(`sr:ed:${id}:${i}`, "Voltar ao editor"),
  ];
}

function midiaView(doc, b) {
  const id = String(doc._id);
  const i = blockIndex(doc, b);
  const block = doc.blocks[i];
  const state = (v) => (v ? (String(v).startsWith("db:") ? "imagem guardada" : "link") : "vazia");
  const main = box().addTextDisplayComponents(
    text(`### ${EMOJI.send} Imagens do bloco ${i + 1}`),
    text(`**Imagem principal**  ${state(block.image)}\n**Miniatura**  ${state(block.thumb)}`),
    text("-# Envie um arquivo (png, jpg, gif ou webp, até 4 MB) ou cole um link. A miniatura aparece ao lado do primeiro trecho de texto.")
  );
  main.addSectionComponents(
    section(btn(`sr:mdi:${id}:${i}`, "Enviar", ButtonStyle.Primary, false, EMOJI.more), "**Imagem principal**\n-# Aparece no corpo do bloco."),
    section(btn(`sr:mdx:${id}:${i}:i`, "Remover", ButtonStyle.Secondary, !block.image, EMOJI.trash), "**Tirar imagem**\n-# Remove a imagem principal."),
    section(btn(`sr:mdt:${id}:${i}`, "Enviar", ButtonStyle.Primary, false, EMOJI.more), "**Miniatura**\n-# Fica ao lado do texto."),
    section(btn(`sr:mdx:${id}:${i}:t`, "Remover", ButtonStyle.Secondary, !block.thumb, EMOJI.trash), "**Tirar miniatura**\n-# Remove a miniatura.")
  );
  return [main, backRow(`sr:ed:${id}:${i}`, "Voltar ao editor")];
}

function aparenciaView(doc, b) {
  const id = String(doc._id);
  const i = blockIndex(doc, b);
  const block = doc.blocks[i];
  const colors = [{ label: "Sem cor", value: "none", default: !block.color }];
  for (const [key, c] of Object.entries(COLORS)) colors.push({ label: c.label, value: key, default: block.color === key });
  const main = box().addTextDisplayComponents(
    text(`### ${EMOJI.settings} Aparência do bloco ${i + 1}`),
    text(
      [
        `**Formato**  ${D.LAYOUTS[doc.layout]?.label} (vale para a mensagem toda)`,
        `**Cor**  ${colorLabel(block.color)}`,
        `**Espaço grande antes da imagem**  ${block.wide ? "sim" : "não"}`,
      ].join("\n")
    )
  );
  main.addActionRowComponents(
    pick(
      `sr:apf:${id}:${i}`,
      "Formato da mensagem",
      Object.entries(D.LAYOUTS).map(([value, l]) => ({ label: l.label, description: l.desc, value, default: doc.layout === value }))
    ),
    pick(`sr:apk:${id}:${i}`, "Cor do bloco", colors)
  );
  main.addSectionComponents(
    section(btn(`sr:apc:${id}:${i}`, "Definir", ButtonStyle.Secondary, false), "**Cor em hexadecimal**\n-# Use um código de cor exato."),
    section(
      btn(`sr:apw:${id}:${i}`, block.wide ? "Sim" : "Não", ButtonStyle.Secondary, false),
      "**Espaço grande antes da imagem**\n-# Deixa um respiro maior acima da imagem."
    )
  );
  return [main, backRow(`sr:ed:${id}:${i}`, "Voltar ao editor")];
}

function interacoesView(doc, b) {
  const id = String(doc._id);
  const i = blockIndex(doc, b);
  const main = box().addTextDisplayComponents(
    text(`### ${EMOJI.member} Botões da mensagem`),
    text("-# Os botões ficam no último bloco que tem conteúdo, ou abaixo da caixa, conforme a posição.")
  );
  main.addSectionComponents(
    section(iconBtn(`sr:bt:${id}:${i}:main`, EMOJI.pencil, ButtonStyle.Primary), "**Botão de entrada**\n-# Texto, emoji, cor e posição."),
    section(iconBtn(`sr:bt:${id}:${i}:part`, EMOJI.pencil), "**Botão de inscritos**\n-# Mostra a lista de quem entrou.")
  );
  return [main, backRow(`sr:ed:${id}:${i}`, "Voltar ao editor")];
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

  const panel = box().addTextDisplayComponents(text(main ? "### Botão de entrada" : "### Botão de inscritos"), text(info.join("\n")));
  panel.addSectionComponents(
    section(iconBtn(`sr:btm:${id}:${i}:${which}`, EMOJI.pencil, ButtonStyle.Primary), "**Editar botão**\n-# Texto, emoji, cor e posição."),
    section(iconBtn(`sr:btx:${id}:${i}:${which}`, EMOJI.trash, ButtonStyle.Secondary, !spec.emoji), "**Tirar emoji**\n-# Remove o emoji deste botão.")
  );
  panel.addActionRowComponents(pick(`sr:btc:${id}:${i}:${which}`, "Cor do botão", colors));

  if (main) {
    panel.addActionRowComponents(
      pick(
        `sr:btp:${id}:${i}`,
        "Posição dos botões",
        Object.entries(D.PLACES).map(([value, p]) => ({ label: p.label, description: p.desc, value, default: doc.place === value }))
      )
    );
  } else {
    panel.addSectionComponents(
      section(
        btn(`sr:pb:${id}:${i}`, spec.visible === false ? "Mostrar" : "Esconder", spec.visible === false ? ButtonStyle.Success : ButtonStyle.Secondary, false),
        "**Visibilidade**\n-# Mostra ou esconde este botão na mensagem."
      )
    );
  }
  return [panel, backRow(`sr:it:${id}:${i}`, "Voltar aos botões")];
}

// ---------- prazo, exclusão ----------

function prazoView(doc) {
  const id = String(doc._id);
  return [
    box()
      .addTextDisplayComponents(
        text(`### ${EMOJI.clock} Mudar o prazo`),
        text(`Termina hoje <t:${unix(doc.endsAt)}:R>.\n-# O novo prazo conta a partir de agora, não do começo do sorteio.`)
      )
      .addActionRowComponents(pick(`sr:pzs:${id}`, "Terminar daqui a...", D.DURATION_OPTIONS.map((o) => ({ label: o.label, value: String(o.ms) }))))
      .addSectionComponents(section(btn(`sr:pzx:${id}`, "Definir", ButtonStyle.Secondary, false, EMOJI.more), "**Outro prazo**\n-# Escolha uma data e hora específicas.")),
    backRow(`sr:home:${id}`),
  ];
}

function deleteView(doc) {
  const id = String(doc._id);
  return [
    box()
      .addTextDisplayComponents(
        text(`### ${EMOJI.trash} Apagar "${clip(doc.name, 60)}"?`),
        text(doc.status === "active" ? "O sorteio está em andamento: a mensagem pública também será apagada e ninguém será sorteado." : "O sorteio e as imagens dele serão apagados de vez.")
      )
      .addSectionComponents(
        section(btn(`sr:delok:${id}`, "Apagar", ButtonStyle.Danger, false, EMOJI.trash), "**Apagar de vez**\n-# Não dá para desfazer."),
        section(btn(`sr:home:${id}`, "Manter", ButtonStyle.Secondary, false, EMOJI.back), "**Manter o sorteio**\n-# Cancela e volta ao painel.")
      ),
  ];
}

// ---------- lista de inscritos (botão público) ----------

const PAGE = 20;

function inscritosView(doc, page) {
  const total = doc.entries.length;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const p = Math.min(Math.max(Number(page) || 0, 0), pages - 1);
  const slice = doc.entries.slice(p * PAGE, p * PAGE + PAGE);
  const view = box().addTextDisplayComponents(
    text(`### ${EMOJI.member} Inscritos em ${clip(doc.name, 60)}`),
    text(slice.length ? slice.map((e, n) => `${p * PAGE + n + 1}. <@${e.userId}>`).join("\n") : "-# Ninguém entrou ainda."),
    text(`-# ${total} inscrito(s) · página ${p + 1} de ${pages}`)
  );
  if (pages > 1) {
    view.addActionRowComponents(
      row(
        btn(`sr:pl:${doc._id}:${p - 1}`, "Anterior", ButtonStyle.Secondary, p === 0, EMOJI.back),
        btn(`sr:pl:${doc._id}:${p + 1}`, "Próxima", ButtonStyle.Secondary, p >= pages - 1)
      )
    );
  }
  return [view];
}

function leaveView(doc) {
  return [
    box()
      .addTextDisplayComponents(text("### Você já está dentro"), text(`Sua inscrição em **${clip(doc.name, 60)}** está valendo. Quer sair da disputa?`))
      .addSectionComponents(section(btn(`sr:leave:${doc._id}`, "Sair", ButtonStyle.Danger, false, EMOJI.trash), "**Sair do sorteio**\n-# Você deixa de concorrer.")),
  ];
}

module.exports = {
  noticeView,
  listView,
  homeView,
  entregaView,
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
