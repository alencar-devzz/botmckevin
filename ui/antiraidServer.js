const {
  ContainerBuilder,
  SectionBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ButtonStyle,
  ChannelType,
} = require("discord.js");
const { ui } = require("./antiraid");
const { helpers } = require("./antiraidModules");
const access = require("./antiraidAccess");
const D = require("../utils/antiraid/defaults");
const { missingPermissions } = require("../utils/antiraid/visual");
const native = require("../utils/antiraid/native");

// Painéis da parte 5: Visual do servidor e Ajustes do Discord (geral, canais e AutoMod).
const { COLOR, text, clip, divider, btn, row } = ui;
const { pickOne, pickMany, nums, toggleSection, alertPick } = helpers;
const { userPick, rolePick } = access.helpers;

const ts = (ms) => `<t:${Math.floor(ms / 1000)}:R>`;
const options = (map) => Object.entries(map).map(([value, i]) => ({ label: i.label, description: i.desc, value }));
const footer = (container, back = "ar:hub") =>
  container.addSeparatorComponents(divider()).addActionRowComponents(row(btn(back, "Voltar")));

function textChannelPick(id, placeholder, guild, channelId) {
  const select = new ChannelSelectMenuBuilder()
    .setCustomId(id)
    .setPlaceholder(placeholder)
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(0)
    .setMaxValues(1);
  if (channelId && guild.channels.cache.has(channelId)) select.setDefaultChannels(channelId);
  return row(select);
}

// ======================= Visual do servidor =======================

function describeSnapshot(snap) {
  if (!snap) return "Nenhuma referência salva ainda. Ela é criada quando você liga a proteção.";
  const has = (hash) => (hash ? "salvo" : "nenhum");
  return [
    `**Nome**  ${clip(snap.name, 80)}`,
    `**Ícone**  ${has(snap.icon)}  ·  **Banner**  ${has(snap.banner)}`,
    `**Fundo do convite**  ${has(snap.splash)}  ·  **Fundo da descoberta**  ${has(snap.discoverySplash)}`,
    `**Descrição**  ${snap.description ? clip(snap.description, 80) : "vazia"}`,
    `-# Referência salva ${ts(snap.savedAt ?? Date.now())}.`,
  ].join("\n");
}

function buildVisualPanel(guild, cfg) {
  const v = cfg.visual;
  const missing = missingPermissions(guild);

  const container = new ContainerBuilder()
    .setAccentColor(v.enabled ? COLOR.on : COLOR.off)
    .addTextDisplayComponents(
      text("### Visual do servidor"),
      text("-# Guarda uma referência do visual do servidor e desfaz alterações feitas por quem não está autorizado.")
    )
    .addSeparatorComponents(divider());

  if (missing.length) {
    container.addTextDisplayComponents(
      text(`**Atenção**\n-# Faltam permissões ao bot: ${missing.join("; ")}. Sem a auditoria, toda alteração é tratada como não autorizada.`)
    );
  }

  container.addSectionComponents(
    toggleSection("ar:vs:toggle", "Proteção", "Ao ligar, o visual atual vira a referência.", v.enabled)
  );

  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(text(`**Referência**\n${describeSnapshot(v.snapshot)}`))
      .setButtonAccessory(btn("ar:vs:snapshot", "Atualizar referência"))
  );

  container.addTextDisplayComponents(text("**O que proteger**\n-# Só estes itens são desfeitos. Mudar um item não protegido só atualiza a referência."));
  container.addActionRowComponents(pickMany("ar:vs:fields", "Escolha o que proteger", D.VS_FIELDS, v.protect));

  container.addTextDisplayComponents(text("**Resposta**\n-# Vale para quem alterar sem autorização."));
  container.addActionRowComponents(pickOne("ar:vs:response", "O que fazer", options(D.VS_RESPONSES), v.response));

  container.addSeparatorComponents(divider());
  container.addTextDisplayComponents(
    text("**Autorizados**\n-# Podem alterar o visual sem acionar a proteção, e a mudança deles vira a nova referência. O dono e o próprio bot já são autorizados.")
  );
  container.addActionRowComponents(
    userPick("ar:vs:users", "Pessoas autorizadas", v.authorizedUsers),
    rolePick("ar:vs:roles", "Cargos autorizados", guild, v.authorizedRoles)
  );

  container.addTextDisplayComponents(text("**Canal de alertas**\n-# Vazio usa o canal do núcleo."));
  container.addActionRowComponents(alertPick("ar:vs:alert", guild, v.alertChannelId));

  footer(container);
  return [container];
}

// ======================= Ajustes do Discord · geral =======================

function buildNativePanel(guild, cfg) {
  const lock = cfg.massJoin.lockdown && cfg.massJoin.lockdown.until > Date.now();

  const container = new ContainerBuilder()
    .setAccentColor(COLOR.neutral)
    .addTextDisplayComponents(
      text("### Ajustes do Discord"),
      text("-# Configurações nativas do servidor. Cada escolha é aplicada no Discord na hora e fica no registro de auditoria.")
    )
    .addSeparatorComponents(divider());

  if (!native.canManageGuild(guild)) {
    container.addTextDisplayComponents(text("**Atenção**\n-# O bot precisa da permissão Gerenciar servidor para aplicar estes ajustes."));
  }

  container.addTextDisplayComponents(
    text(
      `**Nível de verificação**\n-# ${
        lock ? "Há um lockdown em andamento: a verificação está elevada de propósito. " : ""
      }Exigência para quem entra no servidor poder falar.`
    )
  );
  container.addActionRowComponents(
    pickOne("ar:nv:verify", "Nível de verificação", options(D.NV_VERIFICATION), guild.verificationLevel)
  );

  container.addTextDisplayComponents(text("**Filtro de conteúdo explícito**\n-# Análise automática de imagens e links enviados."));
  container.addActionRowComponents(
    pickOne("ar:nv:filter", "Filtro de conteúdo", options(D.NV_FILTER), guild.explicitContentFilter)
  );

  container.addTextDisplayComponents(text("**Notificações padrão**\n-# Valem para quem entra e nunca mexeu nas próprias configurações."));
  container.addActionRowComponents(
    pickOne("ar:nv:notify", "Notificações padrão", options(D.NV_NOTIFY), guild.defaultMessageNotifications)
  );

  container.addTextDisplayComponents(text("**Mensagens do canal de sistema**\n-# Marque as que devem aparecer."));
  container.addActionRowComponents(
    pickMany(
      "ar:nv:system",
      "Mensagens do sistema",
      Object.fromEntries(Object.entries(D.NV_SYSTEM).map(([k, i]) => [k, i.label])),
      native.systemEnabled(guild)
    )
  );

  container.addSeparatorComponents(divider());
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      btn("ar:mod:nativeChannels", "Canais do servidor", ButtonStyle.Primary),
      btn("ar:mod:autoMod", "AutoMod", ButtonStyle.Primary),
      btn("ar:hub", "Voltar")
    )
  );
  return [container];
}

// ======================= Ajustes do Discord · canais =======================

function buildNativeChannelsPanel(guild) {
  const community = guild.features?.includes("COMMUNITY");

  const container = new ContainerBuilder()
    .setAccentColor(COLOR.neutral)
    .addTextDisplayComponents(
      text("### Ajustes do Discord · canais"),
      text("-# Canais especiais do servidor. Esvazie a seleção para remover o canal.")
    )
    .addSeparatorComponents(divider());

  container.addTextDisplayComponents(text("**Canal de mensagens do sistema**\n-# Boas-vindas, impulsos e dicas."));
  container.addActionRowComponents(textChannelPick("ar:nv:sysch", "Canal do sistema", guild, guild.systemChannelId));

  container.addTextDisplayComponents(
    text("**Canal de alertas de segurança**\n-# Onde o Discord avisa sobre raids e contas suspeitas.")
  );
  container.addActionRowComponents(
    textChannelPick("ar:nv:safety", "Canal de alertas de segurança", guild, guild.safetyAlertsChannelId ?? null)
  );

  if (community) {
    container.addTextDisplayComponents(text("**Canal de regras**\n-# Exigido pelo modo Comunidade."));
    container.addActionRowComponents(textChannelPick("ar:nv:rules", "Canal de regras", guild, guild.rulesChannelId));

    container.addTextDisplayComponents(text("**Canal de atualizações da comunidade**\n-# Exigido pelo modo Comunidade."));
    container.addActionRowComponents(
      textChannelPick("ar:nv:updates", "Canal de atualizações", guild, guild.publicUpdatesChannelId)
    );
  } else {
    container.addTextDisplayComponents(
      text("**Regras e atualizações**\n-# Os canais de regras e de atualizações só existem em servidores com o modo Comunidade ativo.")
    );
  }

  footer(container, "ar:mod:native");
  return [container];
}

// ======================= Ajustes do Discord · AutoMod =======================

const TRIGGER_LABEL = {
  1: "Palavras-chave",
  3: "Spam suspeito",
  4: "Lista pronta de palavras",
  5: "Spam de menções",
  6: "Perfil de membro",
};

async function buildAutoModPanel(guild, cfg) {
  const n = cfg.native;
  const rules = await native.fetchRules(guild);
  const list = rules ? [...rules.values()] : [];
  const shown = list.slice(0, 25);

  const container = new ContainerBuilder()
    .setAccentColor(COLOR.neutral)
    .addTextDisplayComponents(
      text("### Ajustes do Discord · AutoMod"),
      text("-# Regras nativas do Discord, que bloqueiam a mensagem antes de ela aparecer no chat.")
    )
    .addSeparatorComponents(divider());

  if (!rules) {
    container.addTextDisplayComponents(text("**Atenção**\n-# Não consegui ler as regras. O bot precisa da permissão Gerenciar servidor."));
  } else {
    container.addTextDisplayComponents(
      text(
        list.length
          ? `**Regras do servidor**  (${list.length})\n${list
              .slice(0, 12)
              .map((r) => `\`${r.enabled ? "ligada" : "desligada"}\`  ${clip(r.name, 50)}`)
              .join("\n")}${list.length > 12 ? `\n-# E mais ${list.length - 12} regra(s); todas aparecem na lista abaixo (até 25).` : ""}`
          : "**Regras do servidor**\n-# Este servidor ainda não tem regras de AutoMod."
      )
    );
  }

  if (shown.length) {
    container.addTextDisplayComponents(text("**Regras ligadas**\n-# Marque as que devem ficar ligadas; as demais são desligadas."));
    container.addActionRowComponents(
      row(
        new StringSelectMenuBuilder()
          .setCustomId("ar:nv:enabled")
          .setPlaceholder("Escolha as regras ligadas")
          .setMinValues(0)
          .setMaxValues(shown.length)
          .addOptions(
            shown.map((r) => ({
              label: clip(r.name, 100),
              description: TRIGGER_LABEL[r.triggerType] ?? "Outro tipo",
              value: r.id,
              default: r.enabled,
            }))
          )
      )
    );
  }

  container.addSeparatorComponents(divider());
  container.addTextDisplayComponents(
    text(
      "**Criar regras recomendadas**\n-# Todas bloqueiam a mensagem e, se houver canal de alertas, avisam lá. A regra de convites também bloqueia convites do próprio servidor; use os cargos isentos para a equipe."
    )
  );
  const exists = (key) => list.some((r) => r.name === D.NV_AUTOMOD[key].name);
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      ...Object.entries(D.NV_AUTOMOD).map(([key, info]) =>
        btn(`ar:nv:new:${key}`, exists(key) ? `${info.label} (criada)` : `Criar: ${info.label}`, ButtonStyle.Success).setDisabled(
          !rules || exists(key)
        )
      )
    )
  );

  container.addTextDisplayComponents(
    text(`**Limite de menções**\n-# Regra de spam de menções: bloqueia mensagens com **${n.mentionLimit}** menções ou mais.`)
  );
  container.addActionRowComponents(
    pickOne("ar:nv:mention", "Limite de menções por mensagem", nums(D.NV_MENTION_LIMITS, (x) => `${x} menções`), n.mentionLimit)
  );

  container.addTextDisplayComponents(
    text("**Cargos isentos**\n-# Valem para as regras criadas aqui (até 20 cargos). Regras que já existiam não mudam.")
  );
  const exempt = new RoleSelectMenuBuilder()
    .setCustomId("ar:nv:xroles")
    .setPlaceholder("Cargos isentos")
    .setMinValues(0)
    .setMaxValues(20);
  const valid = n.exemptRoles.filter((id) => guild.roles.cache.has(id)).slice(0, 20);
  if (valid.length) exempt.setDefaultRoles(...valid);
  container.addActionRowComponents(row(exempt));

  container.addTextDisplayComponents(text("**Canal de alertas do AutoMod**\n-# Usado ao criar novas regras. Vazio não envia alerta."));
  container.addActionRowComponents(textChannelPick("ar:nv:alert", "Canal de alertas", guild, n.alertChannelId));

  footer(container, "ar:mod:native");
  return [container];
}

module.exports = { buildVisualPanel, buildNativePanel, buildNativeChannelsPanel, buildAutoModPanel };
