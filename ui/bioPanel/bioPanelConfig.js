const {
  ContainerBuilder, TextDisplayBuilder, SectionBuilder, SeparatorBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require("discord.js");

const text = (content) => new TextDisplayBuilder().setContent(String(content).slice(0, 3500));
const sep = () => new SeparatorBuilder();

const bool = (v) => (v ? "✅ Sim" : "❌ Não");
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
        text(`**Token de acesso**\n-# ${hasToken ? "✅ Token definida e criptografada" : "⚠️ Nenhuma token definida — a verificação não funcionará"}`)
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId("bp_token_set")
          .setLabel(hasToken ? "Trocar token" : "Definir token")
          .setStyle(ButtonStyle.Secondary)
      )
  );

  if (hasToken) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(text("**Remover token**\n-# Apaga a token do banco de dados"))
        .setButtonAccessory(
          new ButtonBuilder().setCustomId("bp_token_clear").setLabel("Remover").setStyle(ButtonStyle.Danger)
        )
    );
  }

  container.addSeparatorComponents(sep());

  // Lista de painéis
  container.addTextDisplayComponents(
    text(`**Painéis configurados · ${panels.length}**\n-# Cada painel envia uma mensagem num canal com um botão de verificação.`)
  );

  for (const p of panels) {
    const channel = p.channelId ? `<#${p.channelId}>` : "sem canal";
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(text(`**${p.title}** · ${channel}\n-# padrões: ${list(p.patterns)}`))
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(`bp_panel_edit:${p.panelId}`)
            .setLabel("Editar")
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

function buildBioPanelEdit(panel) {
  const { panelId } = panel;
  const id = (action) => `bp_panel:${panelId}:${action}`;

  const channel = panel.channelId ? `<#${panel.channelId}>` : "—";
  const msgSent = panel.messageId ? "✅ Mensagem enviada" : "⚠️ Não publicado";

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text(`### ${panel.title}`),
      text(`-# Painel › Self › Cargos por perfil › **${panel.title}**`)
    )
    .addSeparatorComponents(sep())

    // ── Estado atual
    .addTextDisplayComponents(text("**Situação atual**"))
    .addTextDisplayComponents(
      text(
        `**Canal:** ${channel}\n` +
        `**Publicação:** ${msgSent}\n` +
        `**Verifica bio:** ${bool(panel.checkBio)} · **Status:** ${bool(panel.checkStatus)} · **Pronomes:** ${bool(panel.checkPronouns)}\n` +
        `**Padrões:** ${list(panel.patterns)}\n` +
        `**Dar cargos:** ${roles(panel.giveRoles)}\n` +
        `**Remover cargos:** ${roles(panel.removeRoles)}`
      )
    )
    .addSeparatorComponents(sep())

    // ── Aparência
    .addTextDisplayComponents(text("**Aparência do painel**"))
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(text(`**Título**\n-# ${none(panel.title)}`))
        .setButtonAccessory(new ButtonBuilder().setCustomId(id("edit_title")).setLabel("Editar").setStyle(ButtonStyle.Secondary))
    )
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(text(`**Descrição**\n-# ${none(panel.description)}`))
        .setButtonAccessory(new ButtonBuilder().setCustomId(id("edit_desc")).setLabel("Editar").setStyle(ButtonStyle.Secondary))
    )
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(text(`**Botão de verificação**\n-# label: ${none(panel.buttonLabel)} · emoji: ${none(panel.buttonEmoji)}`))
        .setButtonAccessory(new ButtonBuilder().setCustomId(id("edit_btn")).setLabel("Editar").setStyle(ButtonStyle.Secondary))
    )
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(text(`**Texto de sucesso**\n-# ${none(panel.successText)}`))
        .setButtonAccessory(new ButtonBuilder().setCustomId(id("edit_success")).setLabel("Editar").setStyle(ButtonStyle.Secondary))
    )
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(text(`**Texto de falha**\n-# ${none(panel.failText)}`))
        .setButtonAccessory(new ButtonBuilder().setCustomId(id("edit_fail")).setLabel("Editar").setStyle(ButtonStyle.Secondary))
    )
    .addSeparatorComponents(sep())

    // ── O que verificar
    .addTextDisplayComponents(text("**O que verificar no perfil**"))
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(text(`**Bio (sobre mim):** ${bool(panel.checkBio)}`))
        .setButtonAccessory(new ButtonBuilder().setCustomId(id("toggle_bio")).setLabel(panel.checkBio ? "Desativar" : "Ativar").setStyle(ButtonStyle.Secondary))
    )
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(text(`**Status personalizado:** ${bool(panel.checkStatus)}`))
        .setButtonAccessory(new ButtonBuilder().setCustomId(id("toggle_status")).setLabel(panel.checkStatus ? "Desativar" : "Ativar").setStyle(ButtonStyle.Secondary))
    )
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(text(`**Pronomes:** ${bool(panel.checkPronouns)}`))
        .setButtonAccessory(new ButtonBuilder().setCustomId(id("toggle_pronouns")).setLabel(panel.checkPronouns ? "Desativar" : "Ativar").setStyle(ButtonStyle.Secondary))
    )
    .addSeparatorComponents(sep())

    // ── Padrões
    .addTextDisplayComponents(text(`**Padrões exigidos**\n-# O perfil deve conter TODOS os padrões abaixo nos campos ativados.`))
    .addTextDisplayComponents(text(panel.patterns.length ? panel.patterns.map((p, i) => `${i + 1}. \`${p}\``).join("\n") : "-# Nenhum padrão definido."))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(id("add_pattern")).setLabel("Adicionar padrão").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(id("remove_pattern")).setLabel("Remover padrão").setStyle(ButtonStyle.Secondary).setDisabled(!panel.patterns.length)
      )
    )
    .addSeparatorComponents(sep())

    // ── Cargos
    .addTextDisplayComponents(text("**Cargos**"))
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(text(`**Dar cargos ao verificar**\n-# ${roles(panel.giveRoles)}`))
        .setButtonAccessory(new ButtonBuilder().setCustomId(id("edit_give_roles")).setLabel("Editar").setStyle(ButtonStyle.Secondary))
    )
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(text(`**Remover cargos ao verificar**\n-# ${roles(panel.removeRoles)}`))
        .setButtonAccessory(new ButtonBuilder().setCustomId(id("edit_remove_roles")).setLabel("Editar").setStyle(ButtonStyle.Secondary))
    )
    .addSeparatorComponents(sep())

    // ── Publicação
    .addTextDisplayComponents(text("**Publicação**\n-# O bot envia a mensagem do painel no canal escolhido."))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(id("set_channel")).setLabel("Definir canal").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(id("publish")).setLabel(panel.messageId ? "Reenviar" : "Publicar").setStyle(ButtonStyle.Success).setDisabled(!panel.channelId),
        new ButtonBuilder().setCustomId(id("delete_panel")).setLabel("Excluir painel").setStyle(ButtonStyle.Danger)
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("bp_home").setLabel("Voltar").setStyle(ButtonStyle.Secondary)
      )
    );

  return [container];
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
  buildTokenModal,
  buildTextModal,
  buildPatternModal,
  buildRemovePatternModal,
  buildRolesModal,
  buildChannelModal,
  buildButtonModal,
  buildPublicPanel,
};
