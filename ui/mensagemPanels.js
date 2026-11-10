const {
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ButtonStyle,
  SectionBuilder,
  ThumbnailBuilder,
} = require("discord.js");
const { ui } = require("./antiraid");
const { LIMITS, LAYOUTS, COLORS, BUTTON_STYLES, PLACES, colorLabel, isStored } = require("../utils/msgBuilder/store");
const { textLength, totalTextLength, blockHasContent } = require("../utils/msgBuilder/render");

// Painéis do Criador de mensagens (comando n!mensagem). Tudo em Components V2.
// IDs dos componentes: "msg:<área>:<ação>". Mesmo visual do Anti-Raid: containers sem cor,
// um assunto por container, seletores para navegar e os botões de ação embaixo.

const { text, clip, divider, btn, row, tag, box } = ui;

const CRUMB = "Painel › Comunicação › Mensagens";
const num = (n) => Number(n).toLocaleString("pt-BR");

// Cabeçalho: título + caminho + (opcional) frase curta e linhas de componentes
function header(title, trail, { intro, rows = [] } = {}) {
  const container = box().addTextDisplayComponents(
    text(`## ${title}\n-# ${CRUMB}${trail ? ` › ${trail}` : ""}${intro ? `\n${intro}` : ""}`)
  );
  container.addSeparatorComponents(divider());
  if (rows.length) container.addActionRowComponents(...rows);
  return container;
}

const notice = (content) => [box().addTextDisplayComponents(text(content))];

// ---------- resumos ----------

const currentBlock = (draft) => draft.blocks[draft.cursor];

function blockSummary(b) {
  const bits = [];
  const len = textLength(b.text);
  bits.push(len ? `${num(len)} caracteres` : "sem texto");
  if (b.image) bits.push("imagem");
  if (b.thumb) bits.push("miniatura");
  if (b.buttons.length) bits.push(`${b.buttons.length} botão(ões)`);
  return bits.join(", ");
}

const sourceTag = (source) => (!source ? "`vazia`" : isStored(source) ? "`arquivo enviado`" : "`link`");

// ---------- mensagem pública do comando ----------

function buildMessageHome(guild) {
  const icon =
    guild.iconURL({ extension: "png", size: 256 }) ?? guild.client.user.displayAvatarURL({ extension: "png", size: 256 });

  const head = box().addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        text(`## Criador de mensagens\n-# ${CRUMB}`),
        text(`Monte, revise e publique mensagens de **${clip(guild.name, 60)}**.\n-# O rascunho é pessoal: cada pessoa da equipe edita o seu.`)
      )
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(icon))
  );

  const recursos = box().addTextDisplayComponents(
    text(
      [
        "### O que dá para montar",
        `**Blocos**  até ${LIMITS.blocks} caixas por mensagem`,
        "**Texto**  markdown, separadores e emojis do servidor",
        "**Mídia**  imagem principal e miniatura, por envio ou link",
        `**Botões**  até ${LIMITS.buttons} por bloco, com link ou decorativos`,
        "**Áudio**  arquivo de áudio ou vídeo anexado junto",
      ].join("\n")
    )
  );

  return [head, recursos, row(btn("msg:open", "Abrir editor", ButtonStyle.Primary))];
}

// ---------- resumo do rascunho ----------

function buildOverview({ guild, draft, report }) {
  const images = draft.blocks.reduce((n, b) => n + (b.image ? 1 : 0) + (b.thumb ? 1 : 0), 0);
  const buttons = draft.blocks.reduce((n, b) => n + b.buttons.length, 0);
  const filled = draft.blocks.filter(blockHasContent).length;
  const channel = draft.channelId && guild.channels.cache.has(draft.channelId) ? `<#${draft.channelId}>` : "`não escolhido`";

  const nav = new StringSelectMenuBuilder()
    .setCustomId("msg:nav")
    .setPlaceholder("Escolha o que configurar")
    .addOptions([
      { label: "Resumo", description: "Situação do rascunho", value: "home", default: true },
      { label: "Blocos", description: "Texto, mídia, aparência e botões", value: "blocks" },
      { label: "Áudio", description: "Arquivo de áudio opcional", value: "audio" },
      { label: "Envio", description: "Escolher o canal e publicar", value: "send" },
    ]);

  const head = header("Criador de mensagens", "Resumo", { intro: "Escolha uma área para editar o seu rascunho.", rows: [row(nav)] });

  const rascunho = box().addTextDisplayComponents(
    text(
      [
        "### Rascunho",
        `**Blocos**  \`${draft.blocks.length} de ${LIMITS.blocks}\`  (${filled} com conteúdo)`,
        `**Texto**  \`${num(totalTextLength(draft.blocks))} de ${num(LIMITS.textTotal)}\` caracteres`,
        `**Imagens**  \`${images}\`  ·  **Botões**  \`${buttons}\``,
        `**Áudio**  ${draft.audio.source ? `\`${clip(draft.audio.name ?? "arquivo", 60)}\`` : "`nenhum`"}`,
        `**Canal de envio**  ${channel}`,
        `**Situação**  ${report.ready ? "`Pronto para enviar`" : "`Incompleto`"}`,
        ...report.problems.map((p) => `-# ${p}`),
        ...report.warnings.map((w) => `-# ${w}`),
      ].join("\n")
    )
  );

  const montagem = box()
    .addTextDisplayComponents(
      text(
        [
          "### Montagem",
          "**Conteúdo visual**  texto, mídia e aparência de cada bloco",
          "**Áudio**  anexo opcional enviado logo depois da mensagem",
        ].join("\n")
      )
    )
    .addActionRowComponents(
      row(btn("msg:go:blocks", "Editar blocos", ButtonStyle.Primary), btn("msg:go:audio", "Áudio")),
      row(btn("msg:prev", "Ver prévia"), btn("msg:go:send", "Publicar", ButtonStyle.Success))
    );

  return [head, rascunho, montagem, row(btn("msg:close", "Fechar"))];
}

// ---------- blocos ----------

const PARTS = {
  text: ["Texto", "Conteúdo e separadores"],
  media: ["Mídia", "Imagem principal e miniatura"],
  look: ["Aparência", "Formato, cor e espaçamento"],
  btns: ["Botões", `Até ${LIMITS.buttons} botões extras`],
};

function partSelect(current) {
  return row(
    new StringSelectMenuBuilder()
      .setCustomId("msg:part")
      .setPlaceholder("Escolha a parte do bloco para editar")
      .addOptions(
        Object.entries(PARTS).map(([value, [label, description]]) => ({ label, description, value, default: value === current }))
      )
  );
}

// Linha de navegação dos painéis de cada parte do bloco
function partNav(draft, view) {
  return row(
    btn("msg:go:blocks", "Blocos"),
    btn(`msg:blk:prev:${view}`, "Bloco anterior").setDisabled(draft.cursor === 0),
    btn(`msg:blk:next:${view}`, "Próximo bloco").setDisabled(draft.cursor >= draft.blocks.length - 1)
  );
}

const partTitle = (draft, name) => header(`${name} do bloco ${draft.cursor + 1}`, `Blocos › ${name}`, { rows: [partSelect(null)] });

function buildBlocks({ draft }) {
  const b = currentBlock(draft);

  const lista = box()
    .addTextDisplayComponents(
      text(
        [
          `### Blocos da mensagem  (${draft.blocks.length} de ${LIMITS.blocks})`,
          "-# Cada bloco vira uma caixa. A ordem aqui é a ordem no canal.",
          ...draft.blocks.map(
            (blk, i) => `**${i + 1}**  \`${LAYOUTS[blk.layout]?.label ?? "Caixa"}\`  ${blockSummary(blk)}${i === draft.cursor ? "  \`em edição\`" : ""}`
          ),
        ].join("\n")
      )
    )
    .addActionRowComponents(
      row(
        new StringSelectMenuBuilder()
          .setCustomId("msg:blk:pick")
          .setPlaceholder("Escolha o bloco para editar")
          .addOptions(
            draft.blocks.map((blk, i) => ({
              label: `Bloco ${i + 1}`,
              description: clip(blockSummary(blk), 100),
              value: String(i),
              default: i === draft.cursor,
            }))
          )
      ),
      row(
        btn("msg:blk:add", "Novo bloco", ButtonStyle.Success).setDisabled(draft.blocks.length >= LIMITS.blocks),
        btn("msg:blk:up", "Mover acima").setDisabled(draft.cursor === 0),
        btn("msg:blk:down", "Mover abaixo").setDisabled(draft.cursor >= draft.blocks.length - 1),
        btn("msg:blk:del", draft.blocks.length > 1 ? "Remover bloco" : "Limpar bloco", ButtonStyle.Danger)
      )
    );

  const atual = box()
    .addTextDisplayComponents(
      text(
        [
          `### Bloco ${draft.cursor + 1}`,
          `**Formato**  \`${LAYOUTS[b.layout]?.label ?? "Caixa"}\`  ·  **Cor**  \`${colorLabel(b.color)}\``,
          `**Conteúdo**  ${blockSummary(b)}`,
        ].join("\n")
      )
    )
    .addActionRowComponents(partSelect(null));

  return [header("Blocos", "Blocos"), lista, atual, row(btn("msg:go:home", "Voltar"))];
}

// ---------- texto ----------

const quote = (value, max = 600) =>
  (value.length > max ? `${value.slice(0, max)}...` : value)
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

function buildTextPanel({ draft }) {
  const b = currentBlock(draft);
  const used = totalTextLength(draft.blocks);

  const atual = box()
    .addTextDisplayComponents(
      text(
        [
          "### Texto atual",
          b.text.trim() ? quote(b.text) : "-# Nenhum texto neste bloco.",
          `-# Usado na mensagem inteira: ${num(used)} de ${num(LIMITS.textTotal)} caracteres.`,
        ].join("\n")
      )
    )
    .addActionRowComponents(
      row(btn("msg:txt:edit", "Editar texto", ButtonStyle.Primary), btn("msg:txt:clear", "Remover texto", ButtonStyle.Danger).setDisabled(!b.text.trim()))
    );

  const marcadores = box().addTextDisplayComponents(
    text(
      [
        "### Marcadores",
        "`[separador]`  linha fina entre trechos",
        "`[separador_largo]`  espaço maior entre trechos",
        "-# Markdown do Discord funciona normalmente. Emojis do servidor entram como `<:nome:id>`.",
      ].join("\n")
    )
  );

  return [partTitle(draft, "Texto"), atual, marcadores, partNav(draft, "text")];
}

// ---------- mídia ----------

function buildMediaPanel({ draft }) {
  const b = currentBlock(draft);

  const principal = box()
    .addTextDisplayComponents(
      text(`### Imagem principal  ${sourceTag(b.image)}\n-# Aparece abaixo do texto. Envie um arquivo ou use um link (png, jpg, gif ou webp).`)
    )
    .addActionRowComponents(
      row(btn("msg:med:main", b.image ? "Trocar imagem" : "Definir imagem", ButtonStyle.Primary), btn("msg:med:xmain", "Remover imagem", ButtonStyle.Danger).setDisabled(!b.image))
    );

  const miniatura = box()
    .addTextDisplayComponents(
      text(
        `### Miniatura  ${sourceTag(b.thumb)}\n-# Fica ao lado do primeiro trecho de texto. ${
          b.layout === "image" ? "Não aparece no formato Só imagem." : "Sem texto no bloco, ela não aparece."
        }`
      )
    )
    .addActionRowComponents(
      row(btn("msg:med:thumb", b.thumb ? "Trocar miniatura" : "Definir miniatura", ButtonStyle.Primary), btn("msg:med:xthumb", "Remover miniatura", ButtonStyle.Danger).setDisabled(!b.thumb))
    );

  return [partTitle(draft, "Mídia"), principal, miniatura, partNav(draft, "media")];
}

// ---------- aparência ----------

function buildLookPanel({ draft }) {
  const b = currentBlock(draft);

  const formato = box()
    .addTextDisplayComponents(text("### Formato\n-# Como este bloco aparece no canal."))
    .addActionRowComponents(
      row(
        new StringSelectMenuBuilder()
          .setCustomId("msg:look:format")
          .setPlaceholder("Formato do bloco")
          .addOptions(Object.entries(LAYOUTS).map(([value, i]) => ({ label: i.label, description: i.desc, value, default: b.layout === value })))
      )
    );

  const cor = box()
    .addTextDisplayComponents(
      text(`### Cor da caixa  \`${colorLabel(b.color)}\`\n-# ${b.layout === "box" ? "Barra de cor na lateral da caixa." : "A cor só vale no formato Caixa."}`)
    )
    .addActionRowComponents(
      row(
        new StringSelectMenuBuilder()
          .setCustomId("msg:look:color")
          .setPlaceholder("Escolha uma cor pronta")
          .addOptions([
            { label: "Sem cor", value: "none", default: !b.color },
            ...Object.entries(COLORS).map(([value, c]) => ({ label: c.label, value, default: b.color === value })),
          ])
      ),
      row(btn("msg:look:hex", "Cor personalizada"))
    );

  const espaco = box()
    .addTextDisplayComponents(text(`### Espaçamento amplo  ${tag(b.wide)}\n-# Aumenta o espaço entre texto, imagem e botões do bloco.`))
    .addActionRowComponents(row(b.wide ? btn("msg:look:wide", "Desativar", ButtonStyle.Danger) : btn("msg:look:wide", "Ativar", ButtonStyle.Success)));

  return [partTitle(draft, "Aparência"), formato, cor, espaco, partNav(draft, "look")];
}

// ---------- botões ----------

function buildButtonsPanel({ draft }) {
  const b = currentBlock(draft);

  const lines = b.buttons.length
    ? b.buttons.map((x, i) => {
        const name = x.label ? clip(x.label, 40) : "só emoji";
        const kind = x.url ? "`link`" : `\`decorativo, ${BUTTON_STYLES[x.style] ?? "Cinza"}\``;
        return `**${i + 1}**  ${name}  ${kind}  \`${PLACES[x.place] ?? PLACES.inside}\``;
      })
    : ["-# Nenhum botão neste bloco."];

  const lista = box().addTextDisplayComponents(
    text(
      [
        `### Botões extras  (${b.buttons.length} de ${LIMITS.buttons})`,
        "-# Com link, o botão abre o endereço. Sem link, ele é só decorativo e o clique não faz nada.",
        ...lines,
      ].join("\n")
    )
  );

  const acoes = box().addActionRowComponents(
    ...b.buttons.map((_, i) => row(btn(`msg:btn:edit:${i}`, `Editar botão ${i + 1}`), btn(`msg:btn:del:${i}`, `Remover botão ${i + 1}`, ButtonStyle.Danger))),
    row(btn("msg:btn:add", "Adicionar botão", ButtonStyle.Success).setDisabled(b.buttons.length >= LIMITS.buttons))
  );

  return [partTitle(draft, "Botões"), lista, acoes, partNav(draft, "btns")];
}

// ---------- áudio ----------

function buildAudioPanel({ draft }) {
  const has = Boolean(draft.audio.source);

  const estado = box()
    .addTextDisplayComponents(
      text(
        [
          "### Arquivo de áudio",
          `**Arquivo**  ${has ? `\`${clip(draft.audio.name ?? "arquivo", 60)}\`` : "`nenhum`"}`,
          "-# Formatos: MP3, WAV, M4A, OGG ou vídeo (MP4, MOV, WEBM), até 8 MB.",
          "-# Vai como anexo, em uma mensagem logo depois da principal. Se não houver nenhum bloco com conteúdo, só o áudio é enviado.",
        ].join("\n")
      )
    )
    .addActionRowComponents(
      row(btn("msg:aud:set", has ? "Trocar arquivo" : "Enviar arquivo", ButtonStyle.Primary), btn("msg:aud:clear", "Remover áudio", ButtonStyle.Danger).setDisabled(!has))
    );

  return [header("Áudio", "Áudio"), estado, row(btn("msg:go:home", "Voltar"))];
}

// ---------- envio ----------

function buildSendPanel({ guild, draft, report }) {
  const valid = draft.channelId && guild.channels.cache.has(draft.channelId);
  const picker = new ChannelSelectMenuBuilder()
    .setCustomId("msg:send:channel")
    .setPlaceholder("Escolha o canal de destino")
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1);
  if (valid) picker.setDefaultChannels(draft.channelId);

  const destino = box()
    .addTextDisplayComponents(text(`### Destino\n-# Onde a mensagem será publicada.\n**Canal**  ${valid ? `<#${draft.channelId}>` : "`não escolhido`"}`))
    .addActionRowComponents(row(picker));

  const situacao = box()
    .addTextDisplayComponents(
      text(
        [
          "### Situação",
          `**Blocos com conteúdo**  \`${report.visualBlocks}\`  ·  **Componentes**  \`${report.count} de ${LIMITS.components}\``,
          `**Áudio**  ${report.audio ? "`anexado`" : "`nenhum`"}`,
          ...(report.problems.length ? report.problems.map((p) => `-# ${p}`) : ["-# Tudo certo para publicar."]),
          ...report.warnings.map((w) => `-# ${w}`),
        ].join("\n")
      )
    )
    .addActionRowComponents(
      row(
        btn("msg:send:go", "Publicar agora", ButtonStyle.Success).setDisabled(!report.ready || !valid),
        btn("msg:prev", "Ver prévia"),
        btn("msg:send:reset", "Limpar rascunho", ButtonStyle.Danger)
      )
    );

  return [header("Envio", "Envio"), destino, situacao, row(btn("msg:go:home", "Voltar"))];
}

function buildResetConfirm() {
  return [
    header("Limpar rascunho", "Envio › Limpar"),
    box().addTextDisplayComponents(
      text("### Tem certeza?\n-# Todos os blocos, imagens e o áudio do seu rascunho serão apagados. As mensagens já publicadas não mudam.")
    ),
    row(btn("msg:send:reset_ok", "Limpar tudo", ButtonStyle.Danger), btn("msg:go:send", "Cancelar")),
  ];
}

const VIEWS = {
  home: buildOverview,
  blocks: buildBlocks,
  text: buildTextPanel,
  media: buildMediaPanel,
  look: buildLookPanel,
  btns: buildButtonsPanel,
  audio: buildAudioPanel,
  send: buildSendPanel,
  reset: buildResetConfirm,
};

// Visões que precisam do relatório de renderização (limites e problemas)
const NEEDS_REPORT = new Set(["home", "send"]);

function buildView(view, ctx) {
  const components = (VIEWS[view] ?? VIEWS.home)(ctx);
  // Aviso curto logo abaixo do cabeçalho
  if (ctx.note) components.splice(1, 0, box().addTextDisplayComponents(text(ctx.note)));
  return components;
}

module.exports = { buildMessageHome, buildView, buildNotice: notice, NEEDS_REPORT, VIEWS };
