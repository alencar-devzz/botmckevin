const {
  SectionBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  TextInputStyle,
  ModalBuilder,
  TextInputBuilder,
  ActionRowBuilder,
} = require("discord.js");
const { ui } = require("../antiraid");
const { LAYOUTS, COLORS, BUTTON_STYLES, PLACES, colorLabel, parseHex, isStored } = require("../../utils/msgBuilder/store");
const { textLength } = require("../../utils/msgBuilder/render");
const { textLabel, selectLabel, uploadLabel, modal } = require("../modalHelpers");
const { LIMITS, DEFAULT_MESSAGE, stripEmoji, normalizePanel, panelName } = require("../../utils/tagPanel/message");
const { LIMITS: MSG_LIMITS } = require("../../utils/msgBuilder/store");
const { KINDS, MODES, VAR_HELP, getResponse, isCustom } = require("../../utils/tagPanel/responses");

// Painéis de configuração de "Cargos por tag" (Self). Tudo em Components V2.
// Visual do Criador de mensagens (n!msg): um assunto por container, seletor para navegar entre as etapas
// e botões com texto numa linha embaixo. Nada de emoji: nem os personalizados de seta, nem unicode.
// IDs: "tp_panel:<painel>:<ação>[:<arg>]" (botões e selects) e "tp_modal:<tipo>:<painel>[:<arg>]" (modais).

const { text, clip, divider, btn, row, tag, box } = ui;

// Únicos emojis do editor: setas de Anterior e Próxima
const ARROW = {
  prev: { name: "left2", id: "1573414733745365064" },
  next: { name: "right2", id: "1573414717114810448" },
};

// Ícones do toggle geral (mesmos on3/off3 dos outros sistemas do /menu)
const TOGGLE_EMOJI = {
  on: { name: "on3", id: "1573434230690545664" },
  off: { name: "off3", id: "1573434379181621489" },
};

const num = (n) => Number(n).toLocaleString("pt-BR");
const yes = (v) => (v ? "sim" : "não");
const list = (arr) => (arr.length ? arr.map((s) => `\`${s}\``).join(", ") : "`nenhum`");
const roles = (arr) => (arr.length ? arr.map((id) => `<@&${id}>`).join(", ") : "`nenhum`");

// ─── Tela inicial: toggle e lista de painéis ─────────────────────────────────

function buildTagPanelHome(panels, enabled = true) {
  // Toggle geral no canto do título (esta tela não passa pela conversão automática do breadcrumb)
  const container = box()
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          text("### Verificação de tag"),
          text(
            `Painéis de cargo por tag: o membro usa a tag deste servidor no perfil, clica no botão e recebe o cargo.\n-# Sistema: **${enabled ? "ativado" : "desativado"}**${enabled ? "" : " · os botões dos painéis estão indisponíveis"}`
          )
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId("tp_toggle")
            .setEmoji(enabled ? TOGGLE_EMOJI.on : TOGGLE_EMOJI.off)
            .setStyle(ButtonStyle.Secondary)
        )
    )
    .addSeparatorComponents(divider());

  container
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(
      text(`**Painéis**  \`${panels.length}\`\n-# Cada painel é uma mensagem com um botão, enviada num canal.`)
    );

  // limite de 40 componentes: cada painel listado custa 3
  for (const p of panels.slice(0, 7)) {
    const n = normalizePanel(p);
    const channel = p.channelId ? `<#${p.channelId}>` : "`sem canal`";
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          text(`**${clip(panelName(p), 60)}**  ${channel}\n-# ${p.messageId ? "Publicado" : "Não publicado"}  ·  cargos: ${n.giveRoles.length}`)
        )
        .setButtonAccessory(btn(`tp_panel_edit:${p.panelId}`, "Editar", ButtonStyle.Primary))
    );
  }
  if (!panels.length) container.addTextDisplayComponents(text("-# Nenhum painel criado ainda."));

  // Criar painel e Voltar ficam juntos, numa linha fora da caixa
  return [container, row(btn("tp_panel_create", "Criar painel", ButtonStyle.Success), btn("back_self", "Voltar"))];
}

// ─── Editor de um painel ────────────────────────────────────────────────────

const SECTIONS = [
  { key: "home", label: "Resumo", desc: "Situação do painel" },
  { key: "text", label: "Texto", desc: "Mensagem e markdown" },
  { key: "media", label: "Mídia", desc: "Imagem e miniatura" },
  { key: "look", label: "Aparência", desc: "Formato, cor e espaçamento" },
  { key: "btns", label: "Botões", desc: "Botão do painel e links extras" },
  { key: "roles", label: "Cargos", desc: "Entrega e remoção" },
  { key: "resp", label: "Respostas", desc: "Mensagens do botão do painel" },
  { key: "send", label: "Envio", desc: "Canal e publicação" },
];
const KEYS = SECTIONS.map((s) => s.key);

// Etapa aberta de cada painel (só em memória; volta ao Resumo quando o bot reinicia)
const views = new Map();

// Aceita a chave da etapa, o número dela (1 a 8) ou "del" (confirmação de exclusão)
function setEditPage(panelId, page) {
  const key = page === "del" ? "del" : KEYS.includes(page) ? page : KEYS[Math.min(Math.max(parseInt(page, 10) || 1, 1), KEYS.length) - 1];
  views.set(panelId, key);
  return key;
}

const currentView = (panelId) => views.get(panelId) ?? "home";

// Resposta aberta na etapa Respostas de cada painel (só em memória)
const respKinds = new Map();
const currentKind = (panelId) => respKinds.get(panelId) ?? "ok";
function setRespKind(panelId, kind) {
  respKinds.set(panelId, kind in KINDS ? kind : "ok");
}

// Move uma etapa para frente (+1) ou para trás (-1)
function stepEditPage(panelId, delta) {
  const at = Math.max(KEYS.indexOf(currentView(panelId)), 0);
  return setEditPage(panelId, KEYS[Math.min(Math.max(at + delta, 0), KEYS.length - 1)]);
}

// O Resumo e o Envio mostram a situação da mensagem (limites e problemas), então precisam do relatório
const needsReport = (panelId) => ["home", "send"].includes(currentView(panelId));

const quote = (value, max = 700) =>
  (value.length > max ? `${value.slice(0, max)}...` : value)
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

const sourceTag = (source) => (!source ? "`vazia`" : isStored(source) ? "`arquivo enviado`" : "`link`");
const emojiTag = (e) => (e ? `\`${clip(e, 40)}\`` : "`nenhum`");

// Limite do Discord: 40 componentes por mensagem. Cada etapa usa no máximo ~28.
function buildTagPanelEdit(rawPanel, { report = null, note = null } = {}) {
  const panel = normalizePanel(rawPanel);
  const { panelId } = panel;
  const view = currentView(panelId);
  if (view === "del") return buildDeleteConfirm(panel);

  const id = (action) => `tp_panel:${panelId}:${action}`;
  const at = Math.max(KEYS.indexOf(view), 0);
  const step = SECTIONS[at];
  const published = Boolean(panel.messageId);
  const channel = panel.channelId ? `<#${panel.channelId}>` : "`não escolhido`";
  const layoutName = LAYOUTS[panel.layout]?.label ?? "Caixa";

  // ----- cabeçalho: nome, situação e seletor de etapas -----
  const nav = new StringSelectMenuBuilder()
    .setCustomId(id("nav"))
    .setPlaceholder("Escolha a etapa do editor")
    .addOptions(SECTIONS.map((s) => ({ label: s.label, description: s.desc, value: s.key, default: s.key === view })));

  const head = box()
    .addTextDisplayComponents(
      text(
        [
          "## Editor do painel",
          `**Painel**  ${clip(panelName(rawPanel), 60)}`,
          `**Estado**  ${published ? "`Publicado`" : "`Não publicado`"}  ·  **Formato**  \`${layoutName}\`  ·  **Cor**  \`${colorLabel(panel.color)}\`  ·  **Imagem**  \`${yes(panel.image)}\``,
        ].join("\n")
      )
    )
    .addSeparatorComponents(divider())
    .addActionRowComponents(row(nav));

  // ----- linha de navegação embaixo -----
  const footer = row(
    new ButtonBuilder().setCustomId(id("prev")).setEmoji(ARROW.prev).setStyle(ButtonStyle.Secondary).setDisabled(at === 0),
    new ButtonBuilder().setCustomId(id("next")).setEmoji(ARROW.next).setStyle(ButtonStyle.Secondary).setDisabled(at === SECTIONS.length - 1),
    btn(id("preview"), "Ver prévia"),
    btn("tp_home", "Voltar")
  );

  const title = (extra = "") => `### ${step.label}\n-# Etapa ${at + 1} de ${SECTIONS.length}  ·  ${step.desc}${extra}`;
  const cards = [head];
  if (note) cards.push(box().addTextDisplayComponents(text(note)));

  // ── Resumo ──
  if (view === "home") {
    const problems = report?.problems ?? [];
    const warnings = report?.warnings ?? [];
    const images = (panel.image ? 1 : 0) + (panel.thumb ? 1 : 0);
    const links = panel.extraButtons.filter((b) => b.url).length;
    cards.push(
      box()
        .addTextDisplayComponents(
          text(
            [
              title(),
              `**Texto**  \`${num(textLength(panel.message))} de ${num(LIMITS.text)}\` caracteres  ·  **Imagens**  \`${images}\`  ·  **Links extras**  \`${links}\``,
              `**Regra**  quem usa a tag deste servidor no perfil recebe o cargo`,
              `**Cargos**  dar \`${panel.giveRoles.length}\`  ·  remover \`${panel.removeRoles.length}\``,
              `**Respostas**  \`${Object.keys(KINDS).filter((k) => isCustom(panel, k)).length} de ${Object.keys(KINDS).length}\` personalizadas`,
              `**Canal**  ${channel}`,
              `**Situação**  ${report ? (report.ready ? "`Pronto para publicar`" : "`Incompleto`") : "`Sem checagem`"}`,
              ...problems.map((p) => `-# ${p}`),
              ...warnings.map((w) => `-# ${w}`),
            ].join("\n")
          )
        )
        .addActionRowComponents(
          row(btn(id("go:text"), "Editar texto", ButtonStyle.Primary), btn(id("go:roles"), "Cargos"), btn(id("go:send"), "Publicar", ButtonStyle.Success))
        )
    );
  }

  // ── Texto ──
  else if (view === "text") {
    cards.push(
      box()
        .addTextDisplayComponents(
          text(
            [
              title(),
              "**Mensagem do painel**",
              panel.message.trim() ? quote(panel.message) : "-# Nenhum texto neste painel.",
              `-# ${num(textLength(panel.message))} de ${num(LIMITS.text)} caracteres.`,
            ].join("\n")
          )
        )
        .addActionRowComponents(row(
            btn(id("txt"), panel.message.trim() ? "Editar texto" : "Definir texto", ButtonStyle.Primary),
            btn(id("txt_reset"), "Restaurar padrão"),
            btn(id("txt_clear"), "Remover texto", ButtonStyle.Danger).setDisabled(!panel.message.trim())
          ))
    );
    cards.push(
      box().addTextDisplayComponents(
        text(
          [
            "### Marcadores",
            "`[separador]`  linha fina entre trechos",
            "`[separador_largo]`  espaço maior entre trechos",
            "`[imagem]`  posição da imagem principal (sem ele, ela vem depois do texto)",
            "-# Nenhum separador é colocado sozinho: ele só existe onde você escrever. Vale no começo, no meio e no fim do texto (no fim, ele separa da imagem ou dos botões).",
            "-# Markdown do Discord funciona normalmente. Emojis do servidor entram como `<:nome:id>`; emoji unicode é removido ao salvar.",
          ].join("\n")
        )
      )
    );
  }

  // ── Mídia ──
  else if (view === "media") {
    cards.push(
      box()
        .addTextDisplayComponents(text(`${title()}\n**Imagem principal**  ${sourceTag(panel.image)}\n-# Aparece abaixo do texto. Envie um arquivo ou use um link (png, jpg, gif ou webp).`))
        .addActionRowComponents(
          row(btn(id("img_main"), panel.image ? "Trocar imagem" : "Definir imagem", ButtonStyle.Primary), btn(id("img_xmain"), "Remover imagem", ButtonStyle.Danger).setDisabled(!panel.image))
        ),
      box()
        .addTextDisplayComponents(
          text(
            `**Miniatura**  ${sourceTag(panel.thumb)}\n-# Fica ao lado do primeiro trecho de texto. ${
              panel.layout === "image" ? "Não aparece no formato Só imagem." : "Sem texto no painel, ela não aparece."
            }`
          )
        )
        .addActionRowComponents(
          row(btn(id("img_thumb"), panel.thumb ? "Trocar miniatura" : "Definir miniatura", ButtonStyle.Primary), btn(id("img_xthumb"), "Remover miniatura", ButtonStyle.Danger).setDisabled(!panel.thumb))
        )
    );
  }

  // ── Aparência ──
  else if (view === "look") {
    cards.push(
      box()
        .addTextDisplayComponents(text(`${title()}\n**Formato**  \`${layoutName}\`\n-# Como a mensagem aparece no canal.`))
        .addActionRowComponents(
          row(
            new StringSelectMenuBuilder()
              .setCustomId(id("look_format"))
              .setPlaceholder("Formato da mensagem")
              .addOptions(Object.entries(LAYOUTS).map(([value, i]) => ({ label: i.label, description: i.desc, value, default: panel.layout === value })))
          )
        ),
      box()
        .addTextDisplayComponents(
          text(`### Cor da caixa  \`${colorLabel(panel.color)}\`\n-# ${panel.layout === "box" ? "Barra de cor na lateral da caixa." : "A cor só vale no formato Caixa."}`)
        )
        .addActionRowComponents(
          row(
            new StringSelectMenuBuilder()
              .setCustomId(id("look_color"))
              .setPlaceholder("Escolha uma cor pronta")
              .addOptions([
                { label: "Sem cor", value: "none", default: !panel.color },
                ...Object.entries(COLORS).map(([value, c]) => ({ label: c.label, value, default: panel.color === value })),
              ])
          ),
          row(btn(id("hex"), "Cor personalizada"))
        ),
      box()
        .addTextDisplayComponents(text(`### Espaçamento amplo  ${tag(panel.wide)}\n-# Todos os separadores ficam com espaçamento amplo.`))
        .addActionRowComponents(row(panel.wide ? btn(id("look_wide"), "Desativar", ButtonStyle.Danger) : btn(id("look_wide"), "Ativar", ButtonStyle.Success)))
    );
  }

  // ── Botões ──
  else if (view === "btns") {
    const extras = panel.extraButtons;
    const lines = extras.length
      ? extras.map((b, i) => `**${i + 1}**  ${b.label ? clip(b.label, 40) : "só emoji"}  \`link\`  \`${PLACES[b.place]}\``)
      : ["-# Nenhum botão extra."];

    cards.push(
      box()
        .addTextDisplayComponents(
          text(
            [
              title(),
              `**Botão de verificação**  \`${BUTTON_STYLES[panel.buttonStyle]}\``,
              `**Texto**  ${panel.buttonLabel.trim() ? clip(panel.buttonLabel, 40) : "`vazio`"}  ·  **Emoji**  ${emojiTag(panel.buttonEmoji)}  ·  **Posição**  \`${PLACES[panel.buttonPlace]}\``,
              "-# Quem clica e usa a tag do servidor recebe o cargo.",
            ].join("\n")
          )
        )
        .addActionRowComponents(row(btn(id("btn_main"), "Editar botão", ButtonStyle.Primary))),
      box()
        .addTextDisplayComponents(
          text([`### Links extras  (${extras.length} de ${LIMITS.extraButtons})`, "-# Botões que abrem um endereço, como regras ou convite.", ...lines].join("\n"))
        )
        .addActionRowComponents(
          ...extras.map((_, i) => row(btn(id(`btn_edit:${i}`), `Editar link ${i + 1}`), btn(id(`btn_del:${i}`), `Remover link ${i + 1}`, ButtonStyle.Danger))),
          row(btn(id("btn_add"), "Adicionar link", ButtonStyle.Success).setDisabled(extras.length >= LIMITS.extraButtons))
        )
    );
  }

  // ── Cargos ──
  else if (view === "roles") {
    const roleSelect = (action, placeholder, current) => {
      const menu = new RoleSelectMenuBuilder().setCustomId(id(action)).setPlaceholder(placeholder).setMinValues(0).setMaxValues(10);
      if (current.length) menu.setDefaultRoles(current.slice(0, 10));
      return row(menu);
    };
    cards.push(
      box()
        .addTextDisplayComponents(
          text(`${title()}\n**Dar cargos**\n-# Entregues quando a tag do servidor for encontrada no perfil. @everyone, integrações e cargos acima do bot são ignorados.\n${roles(panel.giveRoles)}`)
        )
        .addActionRowComponents(roleSelect("give_roles", "Escolher cargos para dar...", panel.giveRoles)),
      box()
        .addTextDisplayComponents(text(`### Remover cargos\n-# Retirados do membro ao verificar.\n${roles(panel.removeRoles)}`))
        .addActionRowComponents(roleSelect("remove_roles", "Escolher cargos para remover...", panel.removeRoles))
    );
  }

  // ── Respostas ──
  else if (view === "resp") {
    const kind = currentKind(panelId);
    const info = KINDS[kind];
    const resp = getResponse(panel, kind);
    const custom = isCustom(panel, kind);
    const plain = resp.mode === "text";
    const limit = MSG_LIMITS.respText[resp.mode === "text" ? "text" : resp.mode === "embed" ? "embed" : "v2"];
    const links = resp.buttons.filter((b) => b.url).length;

    const picker = new StringSelectMenuBuilder()
      .setCustomId(id("resp_pick"))
      .setPlaceholder("Escolha a resposta para editar")
      .addOptions(Object.entries(KINDS).map(([value, k]) => ({ label: k.label, description: k.desc, value, default: value === kind })));

    const modeSelect = new StringSelectMenuBuilder()
      .setCustomId(id("rp_mode"))
      .setPlaceholder("Formato da resposta")
      .addOptions(Object.entries(MODES).map(([value, m]) => ({ label: m.label, description: m.desc, value, default: resp.mode === value })));

    const colorSelect = new StringSelectMenuBuilder()
      .setCustomId(id("rp_color"))
      .setPlaceholder(plain ? "Texto puro não tem cor" : "Cor da resposta")
      .setDisabled(plain)
      .addOptions([
        { label: "Sem cor", value: "none", default: !resp.color },
        ...Object.entries(COLORS).map(([value, c]) => ({ label: c.label, value, default: resp.color === value })),
      ]);

    const summary = [
      `### ${info.label}`,
      `**Formato**  \`${MODES[resp.mode].label}\`  ·  **Cor**  \`${plain ? "não usa" : colorLabel(resp.color)}\`  ·  **Imagem**  \`${yes(resp.image)}\`  ·  **Miniatura**  \`${plain ? "não usa" : yes(resp.thumb)}\`  ·  **Links**  \`${links} de ${MSG_LIMITS.respButtons}\``,
    ];
    if (resp.mode === "embed") {
      summary.push(`**Título**  ${resp.title.trim() ? clip(resp.title, 80) : "`vazio`"}  ·  **Rodapé**  ${resp.footer.trim() ? clip(resp.footer, 80) : "`vazio`"}`);
    }
    summary.push("**Texto**", resp.text.trim() ? quote(resp.text, 500) : "-# Nenhum texto.", `-# ${num(resp.text.length)} de ${num(limit)} caracteres.`);
    if (resp.text.length > limit) summary.push("-# O texto passa do limite deste formato e será cortado.");

    const removals = [];
    if (resp.image) removals.push(btn(id("rp_ximg"), "Remover imagem", ButtonStyle.Danger));
    if (resp.thumb) removals.push(btn(id("rp_xthumb"), "Remover miniatura", ButtonStyle.Danger));

    const editor = box()
      .addTextDisplayComponents(text(summary.join("\n")))
      .addActionRowComponents(
        row(modeSelect),
        row(colorSelect),
        row(
          btn(id("rp_txt"), "Editar texto", ButtonStyle.Primary),
          btn(id("rp_hex"), "Cor personalizada").setDisabled(plain),
          btn(id("rp_img"), resp.image ? "Trocar imagem" : "Imagem"),
          btn(id("rp_thumb"), resp.thumb ? "Trocar miniatura" : "Miniatura").setDisabled(plain)
        ),
        row(
          btn(id("rp_link_add"), "Adicionar link", ButtonStyle.Success).setDisabled(links >= MSG_LIMITS.respButtons),
          btn(id("rp_link_clear"), "Limpar links", ButtonStyle.Danger).setDisabled(!links),
          btn(id("rp_preview"), "Ver prévia"),
          btn(id("rp_reset"), "Restaurar padrão").setDisabled(!custom)
        )
      );
    if (removals.length) editor.addActionRowComponents(row(...removals));

    cards.push(
      box()
        .addTextDisplayComponents(
          text(
            [
              title(),
              `**Resposta**  \`${info.label}\`  ·  ${custom ? "`personalizada`" : "`padrão`"}`,
              `-# ${info.desc}.`,
              `-# Variáveis: ${info.vars.map((v) => `\`{${v}}\` ${VAR_HELP[v]}`).join("  ·  ")}`,
              "-# Use [separador], [separador_largo] e [imagem] onde quiser. Valem no Container e no Embed (o texto puro mostra só o texto). Nenhum separador é colocado sozinho.",
            ].join("\n")
          )
        )
        .addActionRowComponents(row(picker)),
      editor
    );
  }

  // ── Envio ──
  else {
    const picker = new ChannelSelectMenuBuilder()
      .setCustomId(id("channel"))
      .setPlaceholder("Canal do painel (limpe para despublicar)")
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setMinValues(0)
      .setMaxValues(1);
    if (panel.channelId) picker.setDefaultChannels([panel.channelId]);

    const problems = report?.problems ?? [];
    cards.push(
      box()
        .addTextDisplayComponents(text(`${title()}\n**Canal**  ${channel}\n-# Escolha onde enviar. Selecionar outro canal move a publicação.`))
        .addActionRowComponents(row(picker)),
      box()
        .addTextDisplayComponents(
          text(
            [
              "### Mensagem",
              `**Estado**  ${published ? "`Publicado`" : "`Não publicado`"}`,
              published ? "-# Edições de texto, mídia, aparência e botões atualizam a mensagem publicada na hora." : "-# O bot envia o painel no canal escolhido.",
              ...(problems.length ? problems.map((p) => `-# ${p}`) : []),
              ...(report?.warnings ?? []).map((w) => `-# ${w}`),
            ].join("\n")
          )
        )
        .addActionRowComponents(
          row(
            btn(id("publish"), published ? "Reenviar" : "Publicar", ButtonStyle.Success).setDisabled(!panel.channelId || Boolean(report && !report.ready)),
            btn(id("del"), "Excluir painel", ButtonStyle.Danger)
          )
        )
    );
  }

  cards.push(footer);
  return cards;
}

function buildDeleteConfirm(panel) {
  const id = (action) => `tp_panel:${panel.panelId}:${action}`;
  return [
    box().addTextDisplayComponents(text("## Excluir painel")).addSeparatorComponents(divider()),
    box()
      .addTextDisplayComponents(
        text(`### Tem certeza?\n-# O painel **${clip(panelName(panel), 60)}**, as imagens guardadas e a mensagem publicada serão apagados. Isso não pode ser desfeito.`)
      )
      .addActionRowComponents(row(btn(id("del_ok"), "Excluir de vez", ButtonStyle.Danger), btn(id("del_no"), "Cancelar"))),
  ];
}

// ─── Modais ─────────────────────────────────────────────────────────────────

function buildTextModal(panelId, panel) {
  return modal(
    `tp_modal:txt:${panelId}`,
    "Texto do painel",
    textLabel({
      id: "text",
      label: "Mensagem",
      description: "Markdown aceito. [separador], [separador_largo] e [imagem] onde quiser.",
      style: TextInputStyle.Paragraph,
      max: LIMITS.text,
      required: true,
      value: normalizePanel(panel).message,
      placeholder: "Escreva a mensagem do painel",
    })
  );
}

const IMAGE_TITLES = { main: "Imagem do painel", thumb: "Miniatura do painel" };

// kind: "main" (imagem principal) ou "thumb" (miniatura)
function buildImageModal(panelId, kind) {
  return modal(
    `tp_modal:img:${panelId}:${kind}`,
    IMAGE_TITLES[kind] ?? "Imagem",
    uploadLabel({ id: "file", label: "Enviar imagem", description: "Escolha uma imagem (png, jpg, gif ou webp) de até 4 MB." }),
    textLabel({
      id: "link",
      label: "Ou use o link de uma imagem",
      description: "Só use se não enviou um arquivo acima.",
      max: 500,
      placeholder: "https://exemplo.com/imagem.png",
    })
  );
}

function buildHexModal(panelId, current) {
  return modal(
    `tp_modal:hex:${panelId}`,
    "Cor personalizada",
    textLabel({
      id: "hex",
      label: "Cor em HEX",
      description: "Use #RRGGBB ou a forma curta #RGB.",
      max: 7,
      required: true,
      value: parseHex(current) ?? "",
      placeholder: "#5865F2",
    })
  );
}

// Botão de verificação: texto, emoji do servidor, cor e posição
function buildMainButtonModal(panelId, panel) {
  const p = normalizePanel(panel);
  return modal(
    `tp_modal:btn_main:${panelId}`,
    "Botão de verificação",
    textLabel({ id: "label", label: "Texto do botão", description: "Opcional quando houver emoji.", max: 80, value: p.buttonLabel, placeholder: "Ex.: Verificar" }),
    textLabel({ id: "emoji", label: "Emoji do servidor (opcional)", description: "Formato <:nome:id>. Emoji unicode não é aceito.", max: 60, value: p.buttonEmoji }),
    selectLabel({ id: "style", label: "Cor", options: Object.entries(BUTTON_STYLES).map(([value, label]) => ({ label, value, default: p.buttonStyle === value })) }),
    selectLabel({ id: "place", label: "Posição", options: Object.entries(PLACES).map(([value, label]) => ({ label, value, default: p.buttonPlace === value })) })
  );
}

// Link extra. index: número do link (0 ou 1) ou "new"
function buildExtraButtonModal(panelId, index, data) {
  return modal(
    `tp_modal:btn_x:${panelId}:${index}`,
    index === "new" ? "Novo link" : `Link ${Number(index) + 1}`,
    textLabel({ id: "label", label: "Texto do botão", description: "Opcional quando houver emoji.", max: 80, value: data?.label, placeholder: "Ex.: Regras" }),
    textLabel({ id: "url", label: "Link", description: "Obrigatório. Começa com https://", max: 500, required: true, value: data?.url, placeholder: "https://exemplo.com" }),
    textLabel({ id: "emoji", label: "Emoji do servidor (opcional)", description: "Formato <:nome:id>. Emoji unicode não é aceito.", max: 60, value: data?.emoji }),
    selectLabel({ id: "place", label: "Posição", options: Object.entries(PLACES).map(([value, label]) => ({ label, value, default: (data?.place ?? "inside") === value })) })
  );
}

// ─── Modais das respostas ───────────────────────────────────────────────────
// IDs: "tp_modal:rp_<tipo>:<painel>:<resposta>[:<arg>]"

function buildRespTextModal(panelId, kind, resp) {
  return modal(
    `tp_modal:rp_txt:${panelId}:${kind}`,
    `Texto: ${KINDS[kind].label}`.slice(0, 45),
    textLabel({
      id: "title",
      label: "Título (só no formato Embed)",
      description: "Aceita variáveis como {usuario}.",
      max: MSG_LIMITS.respTitle,
      value: resp.title,
      placeholder: "Ex.: Cargo entregue",
    }),
    textLabel({
      id: "text",
      label: "Texto da resposta",
      description: "Markdown, variáveis, [separador], [separador_largo] e [imagem].",
      style: TextInputStyle.Paragraph,
      max: MSG_LIMITS.respText.v2,
      required: true,
      value: resp.text,
    }),
    textLabel({
      id: "footer",
      label: "Rodapé (só no formato Embed)",
      description: "Aceita variáveis como {servidor}.",
      max: 200,
      value: resp.footer,
    })
  );
}

function buildRespHexModal(panelId, kind, current) {
  return modal(
    `tp_modal:rp_hex:${panelId}:${kind}`,
    "Cor personalizada",
    textLabel({
      id: "hex",
      label: "Cor em HEX",
      description: "Use #RRGGBB ou a forma curta #RGB.",
      max: 7,
      required: true,
      value: parseHex(current) ?? "",
      placeholder: "#5865F2",
    })
  );
}

// which: "main" (imagem) ou "thumb" (miniatura)
function buildRespImageModal(panelId, kind, which) {
  return modal(
    `tp_modal:rp_img:${panelId}:${kind}:${which}`,
    which === "main" ? "Imagem da resposta" : "Miniatura da resposta",
    uploadLabel({ id: "file", label: "Enviar imagem", description: "Escolha uma imagem (png, jpg, gif ou webp) de até 4 MB." }),
    textLabel({
      id: "link",
      label: "Ou use o link de uma imagem",
      description: "Só use se não enviou um arquivo acima.",
      max: 500,
      placeholder: "https://exemplo.com/imagem.png",
    })
  );
}

function buildRespLinkModal(panelId, kind) {
  return modal(
    `tp_modal:rp_link:${panelId}:${kind}`,
    "Novo link na resposta",
    textLabel({ id: "label", label: "Texto do botão", description: "Opcional quando houver emoji.", max: 80, placeholder: "Ex.: Regras" }),
    textLabel({ id: "url", label: "Link", description: "Obrigatório. Começa com https://", max: 500, required: true, placeholder: "https://exemplo.com" }),
    textLabel({ id: "emoji", label: "Emoji do servidor (opcional)", description: "Formato <:nome:id>. Emoji unicode não é aceito.", max: 60 })
  );
}

module.exports = {
  stripEmoji,
  DEFAULT_MESSAGE,
  buildTagPanelHome,
  buildTagPanelEdit,
  setEditPage,
  stepEditPage,
  needsReport,
  buildTextModal,
  buildImageModal,
  buildHexModal,
  buildMainButtonModal,
  buildExtraButtonModal,
  buildRespTextModal,
  buildRespHexModal,
  buildRespImageModal,
  buildRespLinkModal,
  currentKind,
  setRespKind,
};
