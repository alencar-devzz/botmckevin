const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

// Emoji de check (emoji personalizado do servidor)
const CHECK = "<:check:1571598243526348850>";

const text = (content) => new TextDisplayBuilder().setContent(String(content || "-").slice(0, 3800));
const clip = (value, max) => String(value ?? "").slice(0, max);

// Uma bolinha por emoji: cheia (●) quando já foi processado, vazia (○) quando ainda falta.
// Passando de 20 itens, a barra fica em 20 bolinhas proporcionais.
function dots(done, total, max = 20) {
  const size = Math.min(Math.max(total, 1), max);
  const filled = total ? Math.min(size, Math.round((done / total) * size)) : 0;
  return `-# ${[...Array(size)].map((_, i) => (i < filled ? "●" : "○")).join(" ")}`;
}

const reasonLine = {
  stop: "Encerrado por você.",
  expired: "Encerrado sozinho: o painel só dura cerca de 14 minutos.",
  replaced: "Encerrado porque você abriu outro /addemoji neste canal.",
};

// Painel durante a coleta: o botão de parar fica no topo
function buildActive(state) {
  const stop = new ButtonBuilder()
    .setCustomId(`emj:${state.sid}:stop`)
    .setLabel("Parar e finalizar")
    .setStyle(ButtonStyle.Danger);

  // Título à esquerda e o botão de parar à direita
  const header = new SectionBuilder()
    .addTextDisplayComponents(
      text("## Coleta de emojis ativa"),
      text("-# Envie emojis ou imagens neste canal, um por mensagem ou vários de uma vez. Cada um entra direto no servidor.")
    )
    .setButtonAccessory(stop);

  const container = new ContainerBuilder()
    .addSectionComponents(header)
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      text(
        [
          dots(state.done, state.total),
          `**Processados:** ${state.done}/${state.total} · **Adicionados:** ${state.ok.length} · **Falhas:** ${state.failed.length}`,
          state.current ? `-# Adicionando agora: ${clip(state.current, 60)}` : null,
        ]
          .filter(Boolean)
          .join("\n")
      )
    );

  if (state.ok.length) {
    const shown = state.ok.slice(-24);
    container.addTextDisplayComponents(
      text(`**Últimos adicionados**\n${shown.join(" ")}${state.ok.length > shown.length ? `  +${state.ok.length - shown.length}` : ""}`)
    );
  }

  container.addTextDisplayComponents(text(`-# Encerra sozinho <t:${Math.floor(state.expiresAt / 1000)}:R>`));
  return [container];
}

// Painel quando a coleta termina: o check marca o fim
function buildFinal(state) {
  const none = state.ok.length === 0 && state.failed.length > 0;
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text(none ? "## Nenhum emoji foi adicionado" : `## ${CHECK} Coleta de emojis concluída`),
      text(`-# ${reasonLine[state.reason] ?? reasonLine.stop}`)
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      text(
        `**Adicionados:** ${state.ok.length} · **Falhas:** ${state.failed.length} · **Total recebido:** ${state.total}`
      )
    );

  if (state.ok.length) {
    const shown = state.ok.slice(0, 40);
    container.addTextDisplayComponents(
      text(`**Emojis no servidor**\n${shown.join(" ")}${state.ok.length > shown.length ? `  +${state.ok.length - shown.length}` : ""}`)
    );
  }

  if (state.failed.length) {
    const lines = state.failed.slice(0, 8).map((f) => `• \`${clip(f.name, 32)}\`: ${clip(f.reason, 90)}`);
    if (state.failed.length > 8) lines.push(`• … e mais ${state.failed.length - 8} falha(s)`);
    container.addTextDisplayComponents(text(`**Falharam**\n${lines.join("\n")}`));
  }

  return [container];
}

const buildNotice = (content) => [new ContainerBuilder().addTextDisplayComponents(text(content))];

module.exports = { CHECK, buildActive, buildFinal, buildNotice };
