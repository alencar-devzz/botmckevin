const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  UserSelectMenuBuilder,
  StringSelectMenuBuilder,
  ChannelType,
} = require("discord.js");
const { addBackButton } = require("./backButton");
const { textLabel, modal } = require("./modalHelpers");

// Painel do menu: Comunidade e interação → Convites (configuração do sistema do comando /convites).
// Sem emojis: só texto e botões. Os controles (ligar/desligar, navegação) ficam numa fileira
// embaixo do painel, do lado direito, em vez de um botão no canto do cabeçalho.

const text = (content) => new TextDisplayBuilder().setContent(String(content).slice(0, 3500));
const clip = (value, max) => {
  const s = String(value ?? "");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};
const row = (...components) => new ActionRowBuilder().addComponents(...components);
const btn = (id, label, style = ButtonStyle.Secondary, disabled = false) =>
  new ButtonBuilder().setCustomId(id).setLabel(clip(label, 80)).setStyle(style).setDisabled(Boolean(disabled));
const yesNo = (value) => (value ? "Sim" : "Não");
const num = (n) => Number(n ?? 0).toLocaleString("pt-BR");

function roleName(guild, roleId) {
  const role = guild.roles.cache.get(roleId);
  return role ? `<@&${role.id}>` : "`cargo apagado`";
}

// ---------- Visão geral ----------

function buildInviteHome(guild, cfg, overview) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Convites"),
    text("-# Recompensas por convite, detecção de contas recentes e aviso de conquistas."),
    text(`-# Sistema: **${cfg.enabled ? "ativado" : "desativado"}**${cfg.enabled ? "" : " · nenhuma entrada nova está sendo contada"}`)
  );

  const status = new ContainerBuilder().addTextDisplayComponents(
    text("**Situação atual**"),
    text(
      [
        `**Convites válidos:** ${num(overview.valid)} · **Convidadores ativos:** ${num(overview.inviters)}`,
        `**Contas recentes:** ${num(overview.fake)} · **Saíram:** ${num(overview.left)}`,
        `**Idade mínima da conta:** ${cfg.fakeDays > 0 ? `${cfg.fakeDays} dia(s)` : "detecção desligada"}`,
        `**Cargos de recompensa:** ${cfg.rewards.length} configurado(s) · **Já entregues:** ${num(cfg.rewardsGranted)}`,
        `**Canal de conquistas:** ${cfg.achievementsChannelId ? `<#${cfg.achievementsChannelId}>` : "nenhum"} · **Avisar conquistas:** ${yesNo(cfg.announceRewards)}`,
      ].join("\n")
    )
  );

  const controls = new ContainerBuilder()
    .addTextDisplayComponents(text("**Ajustes rápidos**"))
    .addActionRowComponents(
      row(
        btn("invcfg_page:rewards", "Recompensas"),
        btn("invcfg_page:settings", "Configuração"),
        btn("invcfg_toggle", cfg.enabled ? "Desativar" : "Ativar", cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success)
      )
    );
  addBackButton(controls, "back_comunidade");

  return [header, status, controls];
}

// ---------- Recompensas ----------

function buildInviteRewards(guild, cfg) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Recompensas"),
    text("-# Cargos entregues automaticamente quando a pessoa bate uma meta de convites válidos.")
  );

  const list = cfg.rewards.length
    ? cfg.rewards.map((r) => `${roleName(guild, r.roleId)} — a partir de **${num(r.invites)}** convite(s) válido(s)`).join("\n")
    : "-# Nenhuma recompensa configurada ainda.";

  const body = new ContainerBuilder()
    .addTextDisplayComponents(text("**Cargos configurados**"), text(list))
    .addActionRowComponents(row(btn("invcfg_reward_add", "Adicionar recompensa", ButtonStyle.Success)));

  if (cfg.rewards.length) {
    const removeSelect = new StringSelectMenuBuilder()
      .setCustomId("invcfg_reward_remove")
      .setPlaceholder("Remover recompensas")
      .setMinValues(0)
      .setMaxValues(cfg.rewards.length)
      .addOptions(
        cfg.rewards.map((r) => {
          const role = guild.roles.cache.get(r.roleId);
          return {
            label: clip(role ? role.name : "Cargo apagado", 100),
            description: clip(`A partir de ${r.invites} convite(s) válido(s)`, 100),
            value: r.roleId,
          };
        })
      );
    body.addActionRowComponents(row(removeSelect));
  }

  body.addSeparatorComponents(new SeparatorBuilder());
  body.addActionRowComponents(row(btn("invcfg_home", "Voltar")));

  return [header, body];
}

function buildInviteRewardPick(guild) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Nova recompensa"),
    text("-# Escolha o cargo que será entregue ao bater a meta de convites.")
  );

  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId("invcfg_reward_role")
    .setPlaceholder("Selecione o cargo da recompensa")
    .setMinValues(1)
    .setMaxValues(1);

  const body = new ContainerBuilder().addActionRowComponents(row(roleSelect));
  body.addSeparatorComponents(new SeparatorBuilder());
  body.addActionRowComponents(row(btn("invcfg_page:rewards", "Cancelar")));

  return [header, body];
}

// ---------- Configuração ----------

function buildInviteSettings(guild, cfg) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Configuração"),
    text("-# Detecção de contas recentes, canal de conquistas e ajustes manuais por pessoa.")
  );

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId("invcfg_channel")
    .setPlaceholder("Canal de conquistas (opcional)")
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(0)
    .setMaxValues(1);
  if (cfg.achievementsChannelId && guild.channels.cache.has(cfg.achievementsChannelId)) {
    channelSelect.setDefaultChannels(cfg.achievementsChannelId);
  }

  const bonusSelect = new UserSelectMenuBuilder()
    .setCustomId("invcfg_bonus_pick")
    .setPlaceholder("Ajustar bônus manual de um membro")
    .setMinValues(1)
    .setMaxValues(1);

  const bonusLines = cfg.bonuses.length
    ? cfg.bonuses.map((b) => `<@${b.userId}>: ${b.amount > 0 ? `+${b.amount}` : b.amount}`).join("\n")
    : "-# Nenhum ajuste manual por enquanto.";

  const body = new ContainerBuilder()
    .addTextDisplayComponents(
      text(`**Idade mínima da conta**\n-# ${cfg.fakeDays > 0 ? `Contas com menos de ${cfg.fakeDays} dia(s) contam como fake.` : "Detecção desligada: nenhuma conta é marcada como fake."}`)
    )
    .addActionRowComponents(row(btn("invcfg_edit:fakedays", "Editar idade mínima")))
    .addTextDisplayComponents(text("**Canal de conquistas**\n-# Onde o bot avisa quando alguém ganha um cargo de recompensa."))
    .addActionRowComponents(row(channelSelect))
    .addActionRowComponents(row(btn("invcfg_announce_toggle", `Avisar conquistas: ${yesNo(cfg.announceRewards)}`)))
    .addTextDisplayComponents(text("**Ajuste manual de bônus**\n-# Soma (ou subtrai) convites válidos de uma pessoa, fora da contagem normal."))
    .addActionRowComponents(row(bonusSelect))
    .addTextDisplayComponents(text(bonusLines));

  body.addSeparatorComponents(new SeparatorBuilder());
  body.addActionRowComponents(row(btn("invcfg_home", "Voltar"), btn("invcfg_reset", "Restaurar tudo", ButtonStyle.Danger)));

  return [header, body];
}

// ---------- Modais ----------

function buildFakeDaysModal(cfg) {
  return modal(
    "invcfg_modal:fakedays",
    "Idade mínima da conta",
    textLabel({
      id: "days",
      label: "Dias mínimos de conta",
      description: "Contas mais novas que isso contam como fake. 0 = desliga. Máximo 365.",
      max: 3,
      required: false,
      value: String(cfg.fakeDays),
    })
  );
}

function buildBonusModal(userId, current) {
  return modal(
    `invcfg_modal:bonus:${userId}`,
    "Ajuste manual de bônus",
    textLabel({
      id: "amount",
      label: "Bônus de convites",
      description: "Pode ser negativo. 0 remove o ajuste desta pessoa.",
      max: 8,
      required: false,
      value: String(current ?? 0),
    })
  );
}

function buildRewardModal(roleId, current) {
  return modal(
    `invcfg_modal:reward:${roleId}`,
    "Meta de convites",
    textLabel({
      id: "invites",
      label: "Convites válidos necessários",
      description: "Quantidade mínima de convites válidos para ganhar este cargo.",
      max: 7,
      required: true,
      value: current != null ? String(current) : undefined,
    })
  );
}

module.exports = {
  buildInviteHome,
  buildInviteRewards,
  buildInviteRewardPick,
  buildInviteSettings,
  buildFakeDaysModal,
  buildBonusModal,
  buildRewardModal,
};
