const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require("discord.js");

// ---------- helpers ----------

const text = (content) => new TextDisplayBuilder().setContent(String(content || "-").slice(0, 3800));
const sep = () => new SeparatorBuilder();
const row = (...components) => new ActionRowBuilder().addComponents(...components);
const id = (state, action) => `dmm:${state.sid}:${action}`;

function btn(state, action, label, style = ButtonStyle.Secondary, disabled = false) {
  return new ButtonBuilder()
    .setCustomId(id(state, action))
    .setLabel(label)
    .setStyle(style)
    .setDisabled(disabled);
}

// ---------- Tela 1 — Inicio ----------
// Exibe uma embed de boas-vindas e um botao que abre o modal de redacao.

function buildDmMassaHome(state) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text("### Disparar DMs em massa"),
      text(
        "-# Envie uma mensagem para membros de um servidor via token de conta configurada.\n" +
          "Clique em **Redigir mensagem** para comecar."
      )
    )
    .addSeparatorComponents(sep())
    .addActionRowComponents(
      row(btn(state, "open_modal", "Redigir mensagem", ButtonStyle.Primary))
    );

  return [container];
}

// ---------- Tela 2 — Mensagem redigida + selecao de servidor ----------
// Mostra a mensagem que sera enviada e um StringSelectMenu com os servidores.

function buildDmMassaServers(state, guilds) {
  const preview = state.message
    ? state.message.slice(0, 200) + (state.message.length > 200 ? "…" : "")
    : "(sem mensagem)";

  const select = new StringSelectMenuBuilder()
    .setCustomId(id(state, "pick_guild"))
    .setPlaceholder("Selecione o servidor")
    .setMinValues(1)
    .setMaxValues(1);

  if (guilds.length === 0) {
    select.addOptions(
      new StringSelectMenuOptionBuilder()
        .setValue("none")
        .setLabel("Nenhum servidor encontrado")
        .setDescription("A token nao esta em nenhum servidor ou nao esta configurada.")
        .setDefault(true)
    );
    select.setDisabled(true);
  } else {
    for (const g of guilds.slice(0, 25)) {
      const opt = new StringSelectMenuOptionBuilder()
        .setValue(g.id)
        .setLabel(g.name.slice(0, 100));
      if (state.guildId === g.id) opt.setDefault(true);
      select.addOptions(opt);
    }
  }

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text("### Disparar DMs em massa"),
      text(`**Mensagem redigida:**\n\`\`\`\n${preview}\n\`\`\``),
      text("-# Selecione o servidor cujos membros receberao a mensagem.")
    )
    .addSeparatorComponents(sep())
    .addActionRowComponents(row(select))
    .addActionRowComponents(
      row(
        btn(state, "open_modal", "Editar mensagem", ButtonStyle.Secondary),
        btn(state, "cancel", "Cancelar", ButtonStyle.Danger)
      )
    );

  return [container];
}

// ---------- Tela 3 — Servidor selecionado: configurar e iniciar ----------

function buildDmMassaConfirm(state) {
  const preview = state.message
    ? state.message.slice(0, 200) + (state.message.length > 200 ? "…" : "")
    : "(sem mensagem)";

  const limitLabel = state.limit ? `${state.limit} DMs` : "Todas as DMs possiveis";

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text("### Disparar DMs em massa"),
      text(
        [
          `**Servidor:** ${state.guildName ?? state.guildId}`,
          `**Limite de DMs:** ${limitLabel}`,
          `**Mensagem:**\n\`\`\`\n${preview}\n\`\`\``,
        ].join("\n")
      ),
      text("-# Clique em **Iniciar** para comecar o disparo. Use **Definir limite** para limitar a quantidade de DMs enviadas.")
    )
    .addSeparatorComponents(sep())
    .addActionRowComponents(
      row(
        btn(state, "set_limit", "Definir limite", ButtonStyle.Secondary),
        btn(state, "start", "Iniciar", ButtonStyle.Primary),
        btn(state, "cancel", "Cancelar", ButtonStyle.Danger)
      )
    );

  return [container];
}

// ---------- Tela 4 — Progresso do envio ----------

function buildDmMassaProgress(state) {
  const { sent, failed, total } = state;
  const done = sent + failed;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const bar = buildBar(done, total);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text("### Disparar DMs em massa"),
      text(
        [
          `**Servidor:** ${state.guildName ?? state.guildId}`,
          `**Progresso:** ${done}/${total} (${pct}%)`,
          `${bar}`,
          `**Enviadas:** ${sent}  |  **Falhas:** ${failed}`,
        ].join("\n")
      ),
      text("-# O envio esta em andamento. Esta mensagem sera atualizada ao final.")
    );

  return [container];
}

// ---------- Tela 5 — Resultado final ----------

function buildDmMassaDone(state) {
  const { sent, failed, total } = state;

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text("### Disparar DMs em massa — Concluido"),
      text(
        [
          `**Servidor:** ${state.guildName ?? state.guildId}`,
          `**Total de membros processados:** ${total}`,
          `**Enviadas com sucesso:** ${sent}`,
          `**Falhas:** ${failed}`,
        ].join("\n")
      )
    )
    .addSeparatorComponents(sep())
    .addActionRowComponents(
      row(btn(state, "restart", "Novo disparo", ButtonStyle.Primary))
    );

  return [container];
}

// ---------- Tela de erro / aviso ----------

function buildDmMassaError(state, message) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text("### Disparar DMs em massa"),
      text(message)
    )
    .addSeparatorComponents(sep())
    .addActionRowComponents(
      row(btn(state, "open_modal", "Tentar novamente", ButtonStyle.Secondary))
    );

  return [container];
}

// ---------- helper de barra de progresso ----------

function buildBar(done, total, size = 16) {
  if (!total) return `\`[${"─".repeat(size)}]\``;
  const filled = Math.round((done / total) * size);
  return `\`[${"█".repeat(filled)}${"─".repeat(size - filled)}]\``;
}

module.exports = {
  buildDmMassaHome,
  buildDmMassaServers,
  buildDmMassaConfirm,
  buildDmMassaProgress,
  buildDmMassaDone,
  buildDmMassaError,
};
