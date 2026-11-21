const {
  SectionBuilder,
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
const { LIMITS, DEFAULT_MESSAGE, stripEmoji, normalizePanel, panelName } = require("../../utils/bioPanel/message");

// Painéis de configuração de "Cargos por perfil" (Self). Tudo em Components V2.
// Visual do Criador de mensagens (n!msg): um assunto por container, seletor para navegar entre as etapas
// e botões com texto numa linha embaixo. Nada de emoji: nem os personalizados de seta, nem unicode.
// IDs: "bp_panel:<painel>:<ação>[:<arg>]" (botões e selects) e "bp_modal:<tipo>:<painel>[:<arg>]" (modais).

const { text, clip, divider, btn, row, tag, box } = ui;

const num = (n) => Number(n).toLocaleString("pt-BR");
const yes = (v) => (v ? "sim" : "não");
const list = (arr) => (arr.length ? arr.map((s) => `\`${s}\``).join(", ") : "`nenhum`");
const roles = (arr) => (arr.length ? arr.map((id) => `<@&${id}>`).join(", ") : "`nenhum`");

// ─── Tela inicial: token e lista de painéis ─────────────────────────────────

function buildBioPanelHome(panels, hasToken) {
  const container = box()
    .addTextDisplayComponents(
      text("### Cargos por perfil"),
      text("Painéis de verificação: o membro clica no botão e, se o perfil tiver o que você pediu, recebe os cargos.")
    )
    .addSeparatorComponents(divider());

  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        text(`**Token de acesso**  ${tag(hasToken)}\n-# ${hasToken ? "Definida e criptografada." : "Nenhuma token definida: a verificação não funciona."}`)
      )
      .setButtonAccessory(btn("bp_token_set", hasToken ? "Trocar" : "Definir"))
  );

  if (hasToken) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(text("**Remover token**\n-# Apaga a token do banco de dados."))
        .setButtonAccessory(btn("bp_token_clear", "Remover", ButtonStyle.Danger))
    );
  }

  container
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(
      text(`**Painéis**  \`${panels.length}\`\n-# Cada painel é uma mensagem com botão de verificação, enviada num canal.`)
    );

  // limite de 40 componentes: cada painel listado custa 3
  for (const p of panels.slice(0, 7)) {
    const n = normalizePanel(p);
    const channel = p.channelId ? `<#${p.channelId}>` : "`sem canal`";
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          text(`**${clip(panelName(p), 60)}**  ${channel}\n-# ${p.messageId ? "Publicado" : "Não publicado"}  ·  padrões: ${n.patterns.length}`)
        )
        .setButtonAccessory(btn(`bp_panel_edit:${p.panelId}`, "Editar", ButtonStyle.Primary))
    );
  }
  if (!panels.length) container.addTextDisplayComponents(text("-# Nenhum painel criado ainda."));

  container.addSeparatorComponents(divider()).addActionRowComponents(
    row(btn("bp_panel_create", "Criar painel", ButtonStyle.Success), btn("back_self", "Voltar"))
  );

  return [container];
}

// ─── Editor de um painel ────────────────────────────────────────────────────

const SECTIONS = [
  { key: "home", label: "Resumo", desc: "Situação do painel" },
  { key: "text", label: "Texto", desc: "Mensagem e markdown" },
  { key: "media", label: "Mídia", desc: "Imagem e miniatura" },
  { key: "look", label: "Aparência", desc: "Formato, cor e espaçamento" },
  { key: "btns", label: "Botões", desc: "Botão de verificar e links extras" },
  { key: "verify", label: "Verificação", desc: "O que o perfil precisa ter" },
  { key: "roles", label: "Cargos", desc: "Entrega e remoção" },
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
function buildBioPanelEdit(rawPanel, { report = null, note = null } = {}) {
  const panel = normalizePanel(rawPanel);
  const { panelId } = panel;
  const view = currentView(panelId);
  if (view === "del") return buildDeleteConfirm(panel);

  const id = (action) => `bp_panel:${panelId}:${action}`;
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
    btn(id("prev"), "Anterior").setDisabled(at === 0),
    btn(id("next"), "Próxima").setDisabled(at === SECTIONS.length - 1),
    btn(id("preview"), "Ver prévia"),
    btn("bp_home", "Voltar")
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
              `**Verifica**  bio \`${yes(panel.checkBio)}\`  ·  status \`${yes(panel.checkStatus)}\`  ·  pronomes \`${yes(panel.checkPronouns)}\``,
              `**Padrões**  \`${panel.patterns.length} de ${LIMITS.patterns}\`  ·  **Dar**  \`${panel.giveRoles.length}\`  ·  **Remover**  \`${panel.removeRoles.length}\``,
              `**Canal**  ${channel}`,
              `**Situação**  ${report ? (report.ready ? "`Pronto para publicar`" : "`Incompleto`") : "`Sem checagem`"}`,
              ...problems.map((p) => `-# ${p}`),
              ...warnings.map((w) => `-# ${w}`),
            ].join("\n")
          )
        )
        .addActionRowComponents(
          row(btn(id("go:text"), "Editar texto", ButtonStyle.Primary), btn(id("go:verify"), "Verificação"), btn(id("go:send"), "Publicar", ButtonStyle.Success))
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
              quote(panel.message),
              `-# ${num(textLength(panel.message))} de ${num(LIMITS.text)} caracteres.`,
            ].join("\n")
          )
        )
        .addActionRowComponents(row(btn(id("txt"), "Editar texto", ButtonStyle.Primary), btn(id("txt_reset"), "Restaurar padrão")))
    );
    cards.push(
      box().addTextDisplayComponents(
        text(
          [
            "### Marcadores",
            "`[separador]`  linha fina entre trechos",
            "`[separador_largo]`  espaço maior entre trechos",
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
        .addTextDisplayComponents(text(`### Espaçamento amplo  ${tag(panel.wide)}\n-# Aumenta o espaço entre texto, imagem e botões.`))
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
              "-# Quem clica passa pela verificação de perfil.",
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

  // ── Verificação ──
  else if (view === "verify") {
    const flag = (action, label, on) => btn(id(action), `${label}: ${yes(on)}`, on ? ButtonStyle.Success : ButtonStyle.Secondary);
    const patterns = panel.patterns;

    const padroes = box()
      .addTextDisplayComponents(
        text(
          [
            `### Padrões exigidos  (${patterns.length} de ${LIMITS.patterns})`,
            "-# O perfil precisa conter TODOS os padrões nos campos ligados acima.",
            ...(patterns.length ? patterns.map((p, i) => `**${i + 1}**  \`${clip(p, 80)}\``) : ["-# Nenhum padrão definido."]),
          ].join("\n")
        )
      )
      .addActionRowComponents(row(btn(id("add_pattern"), "Adicionar padrão", ButtonStyle.Success).setDisabled(patterns.length >= LIMITS.patterns)));
    if (patterns.length) {
      padroes.addActionRowComponents(
        row(
          new StringSelectMenuBuilder()
            .setCustomId(id("rm_pattern"))
            .setPlaceholder("Escolha um padrão para remover")
            .addOptions(patterns.map((p, i) => ({ label: clip(`${i + 1}. ${p}`, 100), value: String(i) })))
        )
      );
    }

    cards.push(
      box()
        .addTextDisplayComponents(text(`${title()}\n**O que verificar**\n-# Basta uma fonte conter os padrões.`))
        .addActionRowComponents(
          row(flag("toggle_bio", "Bio", panel.checkBio), flag("toggle_status", "Status", panel.checkStatus), flag("toggle_pronouns", "Pronomes", panel.checkPronouns))
        ),
      padroes,
      box()
        .addTextDisplayComponents(
          text(
            [
              "### Respostas",
              "-# Mensagens privadas mostradas a quem clica. Aceitam markdown e {usuario}.",
              `**Sucesso**  ${panel.successText.trim() ? clip(stripEmoji(panel.successText).replace(/\s+/g, " "), 100) : "`vazio`"}`,
              `**Falha**  ${panel.failText.trim() ? clip(stripEmoji(panel.failText).replace(/\s+/g, " "), 100) : "`vazio`"}`,
            ].join("\n")
          )
        )
        .addActionRowComponents(row(btn(id("resp_ok"), "Resposta de sucesso"), btn(id("resp_fail"), "Resposta de falha")))
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
          text(`${title()}\n**Dar cargos**\n-# Entregues quando o perfil for verificado. @everyone, integrações e cargos acima do bot são ignorados.\n${roles(panel.giveRoles)}`)
        )
        .addActionRowComponents(roleSelect("give_roles", "Escolher cargos para dar...", panel.giveRoles)),
      box()
        .addTextDisplayComponents(text(`### Remover cargos\n-# Retirados do membro ao verificar.\n${roles(panel.removeRoles)}`))
        .addActionRowComponents(roleSelect("remove_roles", "Escolher cargos para remover...", panel.removeRoles))
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
  const id = (action) => `bp_panel:${panel.panelId}:${action}`;
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

// Token de acesso do servidor (modal antigo, sem mudanças)
function buildTokenModal() {
  return new ModalBuilder()
    .setCustomId("bp_modal:set_token")
    .setTitle("Definir token de acesso")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("token")
          .setLabel("Token de usuário do Discord")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Sua token aqui (fica criptografada no banco)")
          .setRequired(true)
          .setMinLength(50)
      )
    );
}

function buildTextModal(panelId, panel) {
  return modal(
    `bp_modal:txt:${panelId}`,
    "Texto do painel",
    textLabel({
      id: "text",
      label: "Mensagem",
      description: "Markdown aceito. Use [separador] ou [separador_largo] para dividir.",
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
    `bp_modal:img:${panelId}:${kind}`,
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
    `bp_modal:hex:${panelId}`,
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
    `bp_modal:btn_main:${panelId}`,
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
    `bp_modal:btn_x:${panelId}:${index}`,
    index === "new" ? "Novo link" : `Link ${Number(index) + 1}`,
    textLabel({ id: "label", label: "Texto do botão", description: "Opcional quando houver emoji.", max: 80, value: data?.label, placeholder: "Ex.: Regras" }),
    textLabel({ id: "url", label: "Link", description: "Obrigatório. Começa com https://", max: 500, required: true, value: data?.url, placeholder: "https://exemplo.com" }),
    textLabel({ id: "emoji", label: "Emoji do servidor (opcional)", description: "Formato <:nome:id>. Emoji unicode não é aceito.", max: 60, value: data?.emoji }),
    selectLabel({ id: "place", label: "Posição", options: Object.entries(PLACES).map(([value, label]) => ({ label, value, default: (data?.place ?? "inside") === value })) })
  );
}

function buildPatternModal(panelId) {
  return modal(
    `bp_modal:add_pattern:${panelId}`,
    "Adicionar padrão",
    textLabel({
      id: "pattern",
      label: "Padrão exigido",
      description: "Texto simples, sem regex.",
      max: 100,
      required: true,
      placeholder: "Ex.: /verificado | exemplo.gg",
    })
  );
}

// kind: "ok" (sucesso) ou "fail" (falha)
function buildReplyModal(panelId, kind, current) {
  const ok = kind === "ok";
  return modal(
    `bp_modal:resp_${kind}:${panelId}`,
    ok ? "Resposta de sucesso" : "Resposta de falha",
    textLabel({
      id: "text",
      label: ok ? "Texto ao verificar com sucesso" : "Texto ao falhar a verificação",
      description: "Markdown aceito. Use {usuario} para mencionar quem clicou.",
      style: TextInputStyle.Paragraph,
      max: LIMITS.reply,
      required: true,
      value: current,
    })
  );
}

module.exports = {
  stripEmoji,
  DEFAULT_MESSAGE,
  buildBioPanelHome,
  buildBioPanelEdit,
  setEditPage,
  stepEditPage,
  needsReport,
  buildTokenModal,
  buildTextModal,
  buildImageModal,
  buildHexModal,
  buildMainButtonModal,
  buildExtraButtonModal,
  buildPatternModal,
  buildReplyModal,
};
