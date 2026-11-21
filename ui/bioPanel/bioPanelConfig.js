const {
  ContainerBuilder, TextDisplayBuilder, SectionBuilder, SeparatorBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require("discord.js");

const text = (content) => new TextDisplayBuilder().setContent(String(content).slice(0, 3500));
const sep = () => new SeparatorBuilder();

// Emojis customizados do bot (mesmos do breadcrumb/categoryPanel)
const EMOJI = {
  arrow: { name: "right2", id: "1573414717114810448" },
  prev: { name: "left2", id: "1573414733745365064" },
  on: { name: "on3", id: "1573434230690545664" },
  off: { name: "off3", id: "1573434379181621489" },
};
const mk = (e) => `<:${e.name}:${e.id}>`;
const bool = (v) => (v ? "Sim" : "Não");
const none = (v) => v || "—";
const list = (arr) => arr.length ? arr.map((s) => `\`${s}\``).join(", ") : "—";
const roles = (arr) => arr.length ? arr.map((id) => `<@&${id}>`).join(", ") : "—";

// ─── Tela inicial do sistema ────────────────────────────────────────────────

function buildBioPanelHome(panels, hasToken) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text("### Cargos por perfil"),
      text(`-# Painel › Funções › Self › **Cargos por perfil**`)
    )
    .addSeparatorComponents(sep());

  // Token
  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        text(`**Token de acesso**\n-# ${hasToken ? "Token definida e criptografada" : "Nenhuma token definida — a verificação não funcionará"}`)
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId("bp_token_set")
          .setEmoji(EMOJI.arrow)
          .setStyle(ButtonStyle.Secondary)
      )
  );

  if (hasToken) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(text("**Remover token**\n-# Apaga a token do banco de dados"))
        .setButtonAccessory(
          new ButtonBuilder().setCustomId("bp_token_clear").setEmoji(EMOJI.arrow).setStyle(ButtonStyle.Danger)
        )
    );
  }

  container.addSeparatorComponents(sep());

  // Lista de painéis
  container.addTextDisplayComponents(
    text(`**Painéis configurados · ${panels.length}**\n-# Cada painel envia uma mensagem num canal com um botão de verificação.`)
  );

  // limite de 40 componentes: cada painel listado custa 3
  for (const p of panels.slice(0, 7)) {
    const channel = p.channelId ? `<#${p.channelId}>` : "sem canal";
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(text(`**${p.title}** · ${channel}\n-# padrões: ${list(p.patterns)}`))
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(`bp_panel_edit:${p.panelId}`)
            .setEmoji(EMOJI.arrow)
            .setStyle(ButtonStyle.Secondary)
        )
    );
  }

  if (!panels.length) {
    container.addTextDisplayComponents(text("-# Nenhum painel criado ainda."));
  }

  container.addSeparatorComponents(sep()).addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("bp_panel_create").setLabel("Criar painel").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("back_self").setLabel("Voltar").setStyle(ButtonStyle.Secondary)
    )
  );

  return [container];
}

// ─── Tela de edição de um painel ────────────────────────────────────────────

// Página aberta de cada painel (só em memória; volta para a 1 ao reiniciar o bot)
const editPages = new Map();
const PAGES = ["Aparência", "Verificação", "Cargos", "Publicação"];
const PAGE_SUB = ["Textos e botão", "Perfil e padrões", "Dar e remover", "Canal e mensagem"];

function setEditPage(panelId, page) {
  const n = Math.min(Math.max(parseInt(page, 10) || 1, 1), PAGES.length);
  editPages.set(panelId, n);
  return n;
}

// Limite do Discord: 40 componentes por mensagem. Cada página usa no máximo ~33.
function buildBioPanelEdit(panel) {
  const { panelId } = panel;
  const page = editPages.get(panelId) || 1;
  const id = (action) => `bp_panel:${panelId}:${action}`;
  const clip = (v, n = 90) => {
    const t = String(v ?? "").replace(/\s+/g, " ");
    return t.length > n ? t.slice(0, n - 1) + "…" : t;
  };
  const patterns = panel.patterns || [];

  const arrowBtn = (action, style = ButtonStyle.Secondary, disabled = false) =>
    new ButtonBuilder().setCustomId(id(action)).setEmoji(EMOJI.arrow).setStyle(style).setDisabled(disabled);
  const toggleBtn = (action, on) =>
    new ButtonBuilder().setCustomId(id(action)).setEmoji(on ? EMOJI.on : EMOJI.off).setStyle(ButtonStyle.Secondary);
  const item = (title, desc, button) =>
    new SectionBuilder()
      .addTextDisplayComponents(text(`**${title}**\n-# ${desc}`))
      .setButtonAccessory(button);

  const channel = panel.channelId ? `<#${panel.channelId}>` : "sem canal";
  const status = panel.messageId ? "Publicado" : "Ainda não publicado";

  // Container do topo (título, caminho e resumo)
  const header = new ContainerBuilder()
    .addTextDisplayComponents(
      text(`### ${clip(panel.title, 100)}\n-# Painel › Self › Cargos por perfil › **${clip(panel.title, 60)}**`)
    )
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      text(`-# Canal · **${channel}** · Status · **${status}** · Padrões · **${patterns.length}**`)
    );

  // Card da página atual
  const card = new ContainerBuilder().addTextDisplayComponents(
    text(`### ${PAGES[page - 1]} · ${page}/${PAGES.length}\n-# ${PAGE_SUB[page - 1]}`)
  ).addSeparatorComponents(sep());

  if (page === 1) {
    card
      .addSectionComponents(item("Título", clip(none(panel.title)), arrowBtn("edit_title")))
      .addSectionComponents(item("Descrição", clip(none(panel.description)), arrowBtn("edit_desc")))
      .addSectionComponents(item("Botão de verificação", `${clip(none(panel.buttonLabel), 40)} · emoji ${none(panel.buttonEmoji)}`, arrowBtn("edit_btn")))
      .addSectionComponents(item("Texto de sucesso", clip(none(panel.successText)), arrowBtn("edit_success")))
      .addSectionComponents(item("Texto de falha", clip(none(panel.failText)), arrowBtn("edit_fail")));
  } else if (page === 2) {
    card
      .addSectionComponents(item("Bio (sobre mim)", bool(panel.checkBio), toggleBtn("toggle_bio", panel.checkBio)))
      .addSectionComponents(item("Status personalizado", bool(panel.checkStatus), toggleBtn("toggle_status", panel.checkStatus)))
      .addSectionComponents(item("Pronomes", bool(panel.checkPronouns), toggleBtn("toggle_pronouns", panel.checkPronouns)))
      .addTextDisplayComponents(
        text(
          `**Padrões exigidos** · ${patterns.length}/10\n-# O perfil deve conter TODOS os padrões nos campos ativados.\n` +
          (patterns.length ? clip(patterns.map((p, i) => `${i + 1}. \`${p}\``).join("\n"), 1200) : "-# Nenhum padrão definido.")
        )
      )
      .addSectionComponents(item("Adicionar padrão", "Texto que o perfil precisa conter.", arrowBtn("add_pattern")))
      .addSectionComponents(item("Remover padrão", "Escolha pelo número.", arrowBtn("remove_pattern", ButtonStyle.Secondary, !patterns.length)));
  } else if (page === 3) {
    card
      .addSectionComponents(item("Dar cargos ao verificar", clip(roles(panel.giveRoles || []), 300), arrowBtn("edit_give_roles")))
      .addSectionComponents(item("Remover cargos ao verificar", clip(roles(panel.removeRoles || []), 300), arrowBtn("edit_remove_roles")));
  } else {
    card
      .addSectionComponents(item("Canal do painel", channel, arrowBtn("set_channel")))
      .addSectionComponents(item(panel.messageId ? "Reenviar mensagem" : "Publicar mensagem", "O bot envia o painel no canal escolhido.", arrowBtn("publish", ButtonStyle.Success, !panel.channelId)))
      .addSectionComponents(item("Excluir painel", "Apaga o painel e a mensagem publicada.", arrowBtn("delete_panel", ButtonStyle.Danger)));
  }

  // Navegação ← → e prévia, igual às telas de referência
  card
    .addSeparatorComponents(sep())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(id(`page:${page - 1}`)).setEmoji(EMOJI.prev).setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
        new ButtonBuilder().setCustomId(id(`page:${page + 1}`)).setEmoji(EMOJI.arrow).setStyle(ButtonStyle.Secondary).setDisabled(page >= PAGES.length)
      )
    )
    .addSeparatorComponents(sep())
    .addSectionComponents(item("Prévia completa", "Confira o painel antes de publicar.", arrowBtn("preview")));

  // "Voltar" no mesmo formato dos demais painéis: o decorator do /menu tira ele do container
  // e coloca numa linha própria embaixo.
  card
    .addSeparatorComponents(sep())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("bp_home").setLabel("Voltar").setStyle(ButtonStyle.Secondary)
      )
    );

  return [header, card];
}

// ─── Modais ─────────────────────────────────────────────────────────────────

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

function buildTextModal(customId, title, label, currentValue, long = false) {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("value")
          .setLabel(label)
          .setStyle(long ? TextInputStyle.Paragraph : TextInputStyle.Short)
          .setValue(currentValue ?? "")
          .setRequired(true)
          .setMaxLength(long ? 1800 : 200)
      )
    );
}

function buildPatternModal(panelId) {
  return new ModalBuilder()
    .setCustomId(`bp_modal:add_pattern:${panelId}`)
    .setTitle("Adicionar padrão")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("pattern")
          .setLabel("Padrão exigido (texto simples, sem regex)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Ex.: /verificado | exemplo.gg")
          .setRequired(true)
          .setMaxLength(100)
      )
    );
}

function buildRemovePatternModal(panelId, patterns) {
  return new ModalBuilder()
    .setCustomId(`bp_modal:remove_pattern:${panelId}`)
    .setTitle("Remover padrão")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("index")
          .setLabel(`Número do padrão (1 a ${patterns.length})`)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(patterns.map((p, i) => `${i + 1}. ${p}`).join(" | ").slice(0, 100))
          .setRequired(true)
          .setMaxLength(3)
      )
    );
}

function buildRolesModal(panelId, field, currentRoles) {
  return new ModalBuilder()
    .setCustomId(`bp_modal:roles:${panelId}:${field}`)
    .setTitle(field === "give" ? "Dar cargos ao verificar" : "Remover cargos ao verificar")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("roles")
          .setLabel("IDs dos cargos separados por vírgula")
          .setStyle(TextInputStyle.Short)
          .setValue(currentRoles.join(", "))
          .setRequired(false)
          .setPlaceholder("123456789, 987654321 (vazio = nenhum)")
          .setMaxLength(500)
      )
    );
}

function buildChannelModal(panelId, current) {
  return new ModalBuilder()
    .setCustomId(`bp_modal:channel:${panelId}`)
    .setTitle("Canal do painel")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("channelId")
          .setLabel("ID do canal")
          .setStyle(TextInputStyle.Short)
          .setValue(current ?? "")
          .setRequired(true)
          .setPlaceholder("ID numérico do canal de texto")
          .setMaxLength(25)
      )
    );
}

function buildButtonModal(panelId, panel) {
  return new ModalBuilder()
    .setCustomId(`bp_modal:button:${panelId}`)
    .setTitle("Botão de verificação")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("label")
          .setLabel("Texto do botão")
          .setStyle(TextInputStyle.Short)
          .setValue(panel.buttonLabel ?? "Verificar")
          .setRequired(true)
          .setMaxLength(80)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("emoji")
          .setLabel("Emoji (opcional, ex.: ✅ ou <:nome:id>)")
          .setStyle(TextInputStyle.Short)
          .setValue(panel.buttonEmoji ?? "")
          .setRequired(false)
          .setMaxLength(100)
      )
    );
}

// ─── Painel enviado no canal (mensagem pública) ──────────────────────────────

function buildPublicPanel(panel) {
  const btn = new ButtonBuilder()
    .setCustomId(`bp_verify:${panel.panelId}`)
    .setLabel(panel.buttonLabel ?? "Verificar")
    .setStyle(ButtonStyle.Success);

  if (panel.buttonEmoji) {
    // emoji unicode ou customizado
    const custom = panel.buttonEmoji.match(/^<a?:(\w+):(\d+)>$/);
    if (custom) {
      btn.setEmoji({ name: custom[1], id: custom[2] });
    } else {
      btn.setEmoji(panel.buttonEmoji);
    }
  }

  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(`## ${panel.title}`))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(text(panel.description))
    .addActionRowComponents(new ActionRowBuilder().addComponents(btn));

  return [container];
}

module.exports = {
  buildBioPanelHome,
  buildBioPanelEdit,
  setEditPage,
  buildTokenModal,
  buildTextModal,
  buildPatternModal,
  buildRemovePatternModal,
  buildRolesModal,
  buildChannelModal,
  buildButtonModal,
  buildPublicPanel,
};
