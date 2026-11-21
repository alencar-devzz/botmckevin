const {
  ContainerBuilder, TextDisplayBuilder, SectionBuilder, SeparatorBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder, RoleSelectMenuBuilder, ChannelSelectMenuBuilder, ChannelType,
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
// Remove emojis unicode de textos salvos (o painel só usa emojis customizados do servidor)
const UNICODE_EMOJI = /[\u2190-\u21ff\u2300-\u23ff\u2600-\u27bf\u2b00-\u2bff\u{1F000}-\u{1FAFF}\u200d\ufe0f]/gu;
const stripEmoji = (v) => String(v ?? "").replace(UNICODE_EMOJI, "").replace(/[ \t]{2,}/g, " ").trim();
const bool = (v) => (v ? "Sim" : "Não");
const none = (v) => stripEmoji(v) || "—";
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
const PAGES = [
  { label: "Visão geral", desc: "Estado e atalhos" },
  { label: "Aparência", desc: "Textos e botão" },
  { label: "Verificação", desc: "Perfil e padrões" },
  { label: "Cargos", desc: "Entrega e remoção" },
  { label: "Publicação", desc: "Canal e mensagem" },
];
const PAGE_HELP = [
  "Resumo do painel e prévia.",
  "Como o painel aparece para os membros.",
  "O que o perfil precisa ter para liberar os cargos.",
  "Cargos dados e removidos ao verificar.",
  "Onde a mensagem do painel é enviada.",
];

function setEditPage(panelId, page) {
  const n = Math.min(Math.max(parseInt(page, 10) || 1, 1), PAGES.length);
  editPages.set(panelId, n);
  return n;
}

// Limite do Discord: 40 componentes por mensagem. Cada página usa no máximo ~30.
function buildBioPanelEdit(panel) {
  const { panelId } = panel;
  const page = editPages.get(panelId) || 1;
  const id = (action) => `bp_panel:${panelId}:${action}`;
  const clip = (v, n = 90) => {
    const t = stripEmoji(v).replace(/\s+/g, " ");
    return t.length > n ? t.slice(0, n - 1) + "…" : t;
  };
  const patterns = panel.patterns || [];
  const give = panel.giveRoles || [];
  const remove = panel.removeRoles || [];

  const arrowBtn = (action, style = ButtonStyle.Secondary, disabled = false) =>
    new ButtonBuilder().setCustomId(id(action)).setEmoji(EMOJI.arrow).setStyle(style).setDisabled(disabled);
  const toggleBtn = (action, on) =>
    new ButtonBuilder().setCustomId(id(action)).setEmoji(on ? EMOJI.on : EMOJI.off).setStyle(ButtonStyle.Secondary);
  const item = (title, desc, button) =>
    new SectionBuilder()
      .addTextDisplayComponents(text(`**${title}**\n-# ${desc}`))
      .setButtonAccessory(button);
  const card = (title, sub) =>
    new ContainerBuilder().addTextDisplayComponents(text(`### ${title}${sub ? `\n-# ${sub}` : ""}`)).addSeparatorComponents(sep());

  const channel = panel.channelId ? `<#${panel.channelId}>` : "sem canal";
  const status = panel.messageId ? "Publicado" : "Ainda não publicado";
  const current = PAGES[page - 1];

  // ── Topo: título, caminho e select de navegação
  const nav = new StringSelectMenuBuilder()
    .setCustomId(id("nav"))
    .setPlaceholder(current.label)
    .addOptions(PAGES.map((p, i) => ({ label: p.label, description: p.desc, value: String(i + 1), default: false })));

  const header = new ContainerBuilder()
    .addTextDisplayComponents(text(`### ${current.label}\n-# Painel › Self › Cargos por perfil › **${current.label}**`))
    .addSeparatorComponents(sep())
    .addActionRowComponents(new ActionRowBuilder().addComponents(nav))
    .addTextDisplayComponents(text(`-# **${clip(panel.title, 60)}** · ${PAGE_HELP[page - 1]}`));

  const cards = [header];

  if (page === 1) {
    cards.push(
      new ContainerBuilder().addTextDisplayComponents(
        text(
          `### Situação\n` +
          `**Canal** · ${channel}\n` +
          `**Publicação** · ${status}\n` +
          `**Verifica** · Bio ${bool(panel.checkBio)} · Status ${bool(panel.checkStatus)} · Pronomes ${bool(panel.checkPronouns)}\n` +
          `**Padrões** · ${patterns.length}\n` +
          `**Dar cargos** · ${give.length} · **Remover cargos** · ${remove.length}`
        )
      ),
      card("Prévia completa", "Confira o painel antes de publicar.").addSectionComponents(
        item("Ver prévia", "Mostra a mensagem como os membros vão ver.", arrowBtn("preview"))
      )
    );
  } else if (page === 2) {
    cards.push(
      card("Aparência", "Textos e botão")
        .addSectionComponents(item("Título", clip(none(panel.title)), arrowBtn("edit_title")))
        .addSectionComponents(item("Descrição", clip(none(panel.description)), arrowBtn("edit_desc")))
        .addSectionComponents(item("Botão de verificação", `${clip(none(panel.buttonLabel), 40)} · emoji ${none(panel.buttonEmoji)}`, arrowBtn("edit_btn")))
        .addSectionComponents(item("Texto de sucesso", clip(none(panel.successText)), arrowBtn("edit_success")))
        .addSectionComponents(item("Texto de falha", clip(none(panel.failText)), arrowBtn("edit_fail")))
    );
  } else if (page === 3) {
    cards.push(
      card("O que verificar", "Basta uma fonte conter os padrões.")
        .addSectionComponents(item("Bio (sobre mim)", bool(panel.checkBio), toggleBtn("toggle_bio", panel.checkBio)))
        .addSectionComponents(item("Status personalizado", bool(panel.checkStatus), toggleBtn("toggle_status", panel.checkStatus)))
        .addSectionComponents(item("Pronomes", bool(panel.checkPronouns), toggleBtn("toggle_pronouns", panel.checkPronouns))),
      new ContainerBuilder()
        .addTextDisplayComponents(
          text(
            `### Padrões exigidos · ${patterns.length}/10\n-# O perfil deve conter TODOS os padrões nos campos ativados.\n` +
            (patterns.length ? clip(patterns.map((p, i) => `${i + 1}. \`${p}\``).join("\n"), 1200) : "-# Nenhum padrão definido.")
          )
        )
        .addSectionComponents(item("Adicionar padrão", "Texto que o perfil precisa conter.", arrowBtn("add_pattern")))
        .addSectionComponents(item("Remover padrão", "Escolha pelo número.", arrowBtn("remove_pattern", ButtonStyle.Secondary, !patterns.length)))
    );
  } else if (page === 4) {
    const roleSelect = (action, ph, list) => {
      const menu = new RoleSelectMenuBuilder().setCustomId(id(action)).setPlaceholder(ph).setMinValues(0).setMaxValues(10);
      if (list.length) menu.setDefaultRoles(list.slice(0, 10));
      return new ActionRowBuilder().addComponents(menu);
    };
    cards.push(
      new ContainerBuilder()
        .addTextDisplayComponents(text(`### Dar cargos\n-# Entregues quando o perfil for verificado. @everyone, integrações e cargos acima do bot são ignorados.\n${give.length ? roles(give) : "Nenhum cargo escolhido."}`))
        .addActionRowComponents(roleSelect("give_roles", "Escolher cargos para dar...", give)),
      new ContainerBuilder()
        .addTextDisplayComponents(text(`### Remover cargos\n-# Retirados do membro ao verificar.\n${remove.length ? roles(remove) : "Nenhum cargo escolhido."}`))
        .addActionRowComponents(roleSelect("remove_roles", "Escolher cargos para remover...", remove))
    );
  } else {
    const chMenu = new ChannelSelectMenuBuilder()
      .setCustomId(id("channel"))
      .setPlaceholder("Canal do painel (limpe para despublicar)...")
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setMinValues(0)
      .setMaxValues(1);
    if (panel.channelId) chMenu.setDefaultChannels([panel.channelId]);
    cards.push(
      new ContainerBuilder()
        .addTextDisplayComponents(text(`### Canal\n-# Escolha onde enviar. Selecionar outro canal move a publicação.\n**Canal atual** · ${channel}`))
        .addActionRowComponents(new ActionRowBuilder().addComponents(chMenu)),
      card("Mensagem", status)
        .addSectionComponents(item(panel.messageId ? "Reenviar mensagem" : "Publicar mensagem", "O bot envia o painel no canal escolhido.", arrowBtn("publish", ButtonStyle.Success, !panel.channelId)))
        .addSectionComponents(item("Excluir painel", "Apaga o painel e a mensagem publicada.", arrowBtn("delete_panel", ButtonStyle.Danger)))
    );
  }

  // "Voltar" igual aos demais painéis: o decorator do /menu tira o botão do container e põe numa linha embaixo
  cards[cards.length - 1]
    .addSeparatorComponents(sep())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("bp_home").setLabel("Voltar").setStyle(ButtonStyle.Secondary)
      )
    );

  return cards;
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
          .setLabel("Emoji (opcional, ex.: <:nome:id>)")
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
  stripEmoji,
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
