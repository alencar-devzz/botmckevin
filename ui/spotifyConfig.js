const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  StringSelectMenuBuilder,
  ChannelType,
  TextInputStyle,
} = require("discord.js");
const { addBackButton } = require("./backButton");
const { textLabel, modal } = require("./modalHelpers");
const { vagalumeAvailable } = require("../utils/spotify/lyrics");
const { DEFAULT_LABELS } = require("../utils/spotify/store");

// Painéis do menu: Comunidade e interação → Comando spotify

const text = (content) => new TextDisplayBuilder().setContent(String(content).slice(0, 3000));
const btn = (id, label, style = ButtonStyle.Secondary) =>
  new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
const yesNo = (value) => (value ? "Sim" : "Não");
const row = (...components) => new ActionRowBuilder().addComponents(...components);

const ACCESS_LABEL = { everyone: "Todos os membros", roles: "Somente os cargos escolhidos" };
const BAR_LABEL = { green: "Verde do Spotify", cover: "Cor tirada da capa" };
const GLASS_LABEL = { dark: "Mais escuro", normal: "Padrão", light: "Mais claro" };
const LYRICS_LABEL = { lrclib: "LRCLIB", vagalume: "Vagalume", off: "Desligada" };

const mentionRoles = (list) => (list.length ? list.map((id) => `<@&${id}>`).join(" ") : "`Nenhum`");
const mentionChannels = (list) => (list.length ? list.map((id) => `<#${id}>`).join(" ") : "`Todos`");
const inline = (value, max = 60) => {
  const clean = String(value || "").replace(/`/g, "'").replace(/\s+/g, " ");
  return clean ? `\`${clean.length > max ? `${clean.slice(0, max)}…` : clean}\`` : "`padrão`";
};
const minutes = (value) => (value ? `\`${value >= 60 && value % 60 === 0 ? `${value / 60}h` : `${value} min`}\`` : "`não apaga`");

const lyricsText = (cfg) =>
  cfg.lyricsSource === "vagalume" && !vagalumeAvailable()
    ? "Vagalume (sem chave, usa o LRCLIB)"
    : LYRICS_LABEL[cfg.lyricsSource];

// ---------- Painel principal ----------

function buildSpotifyHome(guild, cfg) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Comando spotify"),
    text("-# Card com a música que a pessoa está ouvindo no Spotify. Defina quem usa, onde, o visual e o comportamento."),
    text(`-# Comando: **${cfg.enabled ? "ativado" : "desativado"}**`)
  );

  const status = new ContainerBuilder().addTextDisplayComponents(
    text("**Situação atual**"),
    text(
      [
        `**Canais permitidos:** ${mentionChannels(cfg.allowedChannels.filter((id) => guild.channels.cache.has(id)))}`,
        `**Quem pode usar:** ${ACCESS_LABEL[cfg.access]}${
          cfg.access === "roles" ? ` · ${mentionRoles(cfg.roles.filter((id) => guild.roles.cache.has(id)))}` : ""
        }`,
        `**Ver a música de outra pessoa (\`@pessoa\`):** ${yesNo(cfg.allowOthers)} · **Espera por pessoa:** ${cfg.cooldown ? `\`${cfg.cooldown}s\`` : "`nenhuma`"}`,
        `**Barra de progresso:** ${BAR_LABEL[cfg.barColor]} · **Vidro:** ${GLASS_LABEL[cfg.glass]}`,
        `**Pílula do Spotify:** ${yesNo(cfg.showPill)} · **Faixa "Ouvindo agora":** ${yesNo(cfg.showNowPlaying)}`,
        `**Botões:** ${[cfg.infoLabel, cfg.refreshLabel].filter((_, i) => (i === 0 ? cfg.showInfoButton : cfg.showRefreshButton)).map((l) => inline(l, 30)).join(" ") || "`só o link`"}`,
        `**Fonte da letra:** ${lyricsText(cfg)}`,
        `**Apagar o card sozinho:** ${minutes(cfg.autoDeleteMinutes)} · **Mensagem de "não está ouvindo":** ${cfg.notListeningMessage ? inline(cfg.notListeningMessage, 50) : "`padrão`"}`,
        "-# Administradores e o dono ignoram cargos, \"outras pessoas\" e espera (os canais valem para todos).",
      ].join("\n")
    )
  );

  const controls = new ContainerBuilder()
    .addTextDisplayComponents(text("**Ajustes rápidos**"), text("-# Clique para alternar cada opção."))
    .addActionRowComponents(
      row(
        btn("sptcfg_toggle", cfg.enabled ? "Desativar" : "Ativar", cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
        btn("sptcfg_access", `Quem usa: ${cfg.access === "roles" ? "Só cargos" : "Todos"}`),
        btn("sptcfg_others", `Outras pessoas: ${yesNo(cfg.allowOthers)}`)
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      row(
        btn("sptcfg_page:use", "Uso e canais"),
        btn("sptcfg_page:look", "Aparência"),
        btn("sptcfg_page:buttons", "Botões e letra"),
        btn("sptcfg_page:behavior", "Comportamento"),
        btn("sptcfg_reset", "Restaurar padrão", ButtonStyle.Danger)
      )
    );
  addBackButton(controls, "back_comunidade");

  return [header, status, controls];
}

// ---------- Uso e canais ----------

function channelSelect(customId, placeholder, guild, selected) {
  const select = new ChannelSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(0)
    .setMaxValues(25);
  const defaults = selected.filter((id) => guild.channels.cache.has(id)).slice(0, 25);
  if (defaults.length) select.setDefaultChannels(...defaults);
  return row(select);
}

function roleSelect(customId, placeholder, guild, selected) {
  const select = new RoleSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .setMinValues(0)
    .setMaxValues(25);
  const defaults = selected.filter((id) => guild.roles.cache.has(id)).slice(0, 25);
  if (defaults.length) select.setDefaultRoles(...defaults);
  return row(select);
}

function buildSpotifyUse(guild, cfg) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Uso e canais do comando spotify"),
    text("-# Onde o comando funciona, quem pode usar e a espera entre usos.")
  );

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text("**Canais permitidos**"),
      text("-# Se escolher algum, o comando só funciona neles (evita poluir o chat geral). Vazio = todos os canais.")
    )
    .addActionRowComponents(channelSelect("sptcfg_allowedch", "Selecione os canais permitidos", guild, cfg.allowedChannels))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      text("**Cargos que podem usar**"),
      text(
        cfg.access === "roles"
          ? "-# Só quem tem pelo menos um destes cargos usa o comando."
          : "-# O modo está em \"Todos\": esta lista não tem efeito agora. Troque o modo nos botões abaixo."
      )
    )
    .addActionRowComponents(roleSelect("sptcfg_roles", "Selecione os cargos permitidos", guild, cfg.roles))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      text("**Regras de uso**"),
      text(
        `-# Quem usa: **${ACCESS_LABEL[cfg.access]}** · Outras pessoas: **${yesNo(cfg.allowOthers)}** · Espera: **${cfg.cooldown ? `${cfg.cooldown}s` : "nenhuma"}**`
      )
    )
    .addActionRowComponents(
      row(
        btn("sptcfg_access:use", `Quem usa: ${cfg.access === "roles" ? "Só cargos" : "Todos"}`),
        btn("sptcfg_others:use", `n!spotify @pessoa: ${yesNo(cfg.allowOthers)}`),
        btn("sptcfg_edit:cooldown", "Espera por pessoa")
      )
    );
  addBackButton(container, "sptcfg_home");

  return [header, container];
}

// ---------- Aparência ----------

function buildSpotifyLook(cfg) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Aparência do card"),
    text("-# Cores e elementos da imagem. Use \"Pré-visualizar\" para ver como fica antes de usar no servidor.")
  );

  const glass = new StringSelectMenuBuilder()
    .setCustomId("sptcfg_glass")
    .setPlaceholder("Intensidade do vidro")
    .addOptions(
      { label: "Mais escuro", description: "Faixas bem escuras por cima da capa.", value: "dark", default: cfg.glass === "dark" },
      { label: "Padrão", description: "Equilíbrio entre capa e legibilidade.", value: "normal", default: cfg.glass === "normal" },
      { label: "Mais claro", description: "Vidro leve, deixa a capa aparecer mais.", value: "light", default: cfg.glass === "light" }
    );

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text("**Barra de progresso**"),
      text(`-# Cor atual: **${BAR_LABEL[cfg.barColor]}**. Na cor da capa, sem cor marcante (capa cinza) a barra fica verde.`)
    )
    .addActionRowComponents(
      row(btn("sptcfg_bar", `Cor da barra: ${cfg.barColor === "cover" ? "Capa" : "Verde"}`))
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      text("**Elementos do card**"),
      text("-# Sem a faixa \"Ouvindo agora\", o texto e a barra descem para ocupar o espaço.")
    )
    .addActionRowComponents(
      row(
        btn("sptcfg_pill", `Pílula do Spotify: ${yesNo(cfg.showPill)}`),
        btn("sptcfg_nowplaying", `Faixa Ouvindo agora: ${yesNo(cfg.showNowPlaying)}`)
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(text("**Intensidade do vidro**"), text("-# Quão escuro ou claro fica o vidro sobre a capa."))
    .addActionRowComponents(row(glass))
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(row(btn("sptcfg_preview", "Pré-visualizar", ButtonStyle.Primary)));
  addBackButton(container, "sptcfg_home");

  return [header, container];
}

// ---------- Botões e letra ----------

function buildSpotifyButtons(cfg) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Botões e letra"),
    text("-# O botão do link do Spotify fica sempre no card; os outros dois podem ser desligados.")
  );

  const lyrics = new StringSelectMenuBuilder()
    .setCustomId("sptcfg_lyrics")
    .setPlaceholder("Fonte da letra")
    .addOptions(
      { label: "LRCLIB", description: "Padrão, sem chave de acesso.", value: "lrclib", default: cfg.lyricsSource === "lrclib" },
      {
        label: "Vagalume",
        description: vagalumeAvailable() ? "Bom para músicas brasileiras." : "Precisa da variável VAGALUME_API_KEY (senão usa o LRCLIB).",
        value: "vagalume",
        default: cfg.lyricsSource === "vagalume",
      },
      { label: "Desligada", description: "Informações sem a letra.", value: "off", default: cfg.lyricsSource === "off" }
    );

  const container = new ContainerBuilder()
    .addTextDisplayComponents(text("**Botões do card**"), text("-# Clique para ligar ou desligar cada botão."))
    .addActionRowComponents(
      row(
        btn("sptcfg_infobtn", `Informações e letra: ${yesNo(cfg.showInfoButton)}`),
        btn("sptcfg_refreshbtn", `Atualizar: ${yesNo(cfg.showRefreshButton)}`),
        btn("sptcfg_edit:labels", "Textos dos botões")
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      text("**Fonte da letra**"),
      text(
        `-# Atual: **${lyricsText(cfg)}**. ${cfg.showInfoButton ? "" : "O botão de informações está desligado, então a letra não aparece no card. "}Se o Vagalume não achar, o LRCLIB é usado.`
      )
    )
    .addActionRowComponents(row(lyrics))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      text("**Textos atuais**"),
      text(`Link: ${inline(cfg.linkLabel, 40)} · Informações: ${inline(cfg.infoLabel, 40)} · Atualizar: ${inline(cfg.refreshLabel, 40)}`)
    );
  addBackButton(container, "sptcfg_home");

  return [header, container];
}

// ---------- Comportamento ----------

function buildSpotifyBehavior(cfg) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Comportamento"),
    text("-# O que acontece com o card depois de enviado e quando a pessoa não está ouvindo nada.")
  );

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text("**Apagar o card sozinho**"),
      text(`-# Depois de ${minutes(cfg.autoDeleteMinutes)} o card é apagado (0 = nunca). Continua valendo mesmo se o bot reiniciar.`)
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      text("**Mensagem de \"não está ouvindo\"**"),
      text(
        cfg.notListeningMessage
          ? `\`\`\`\n${cfg.notListeningMessage.replace(/```/g, "'''")}\n\`\`\``
          : "-# Usando a mensagem padrão (uma para quem usa o comando e outra para quando marcam alguém)."
      ),
      text("-# Variáveis: `{user}` menciona a pessoa e `{name}` mostra o nome dela.")
    )
    .addActionRowComponents(
      row(
        btn("sptcfg_edit:behavior", "Editar tempo e mensagem"),
        btn("sptcfg_resetmsg", "Mensagem padrão", ButtonStyle.Secondary)
      )
    );
  addBackButton(container, "sptcfg_home");

  return [header, container];
}

// ---------- Modais ----------

function buildCooldownModal(cfg) {
  return modal(
    "sptcfg_modal:cooldown",
    "Espera por pessoa",
    textLabel({
      id: "cooldown",
      label: "Espera entre usos (segundos)",
      description: "0 = sem espera. Máximo: 3600.",
      max: 4,
      value: String(cfg.cooldown),
      placeholder: "0",
    })
  );
}

function buildLabelsModal(cfg) {
  return modal(
    "sptcfg_modal:labels",
    "Textos dos botões",
    textLabel({
      id: "linkLabel",
      label: "Botão do link do Spotify",
      description: "Deixe vazio para voltar ao padrão.",
      max: 80,
      value: cfg.linkLabel === DEFAULT_LABELS.linkLabel ? "" : cfg.linkLabel,
      placeholder: DEFAULT_LABELS.linkLabel,
    }),
    textLabel({
      id: "infoLabel",
      label: "Botão de informações e letra",
      description: "Deixe vazio para voltar ao padrão.",
      max: 80,
      value: cfg.infoLabel === DEFAULT_LABELS.infoLabel ? "" : cfg.infoLabel,
      placeholder: DEFAULT_LABELS.infoLabel,
    }),
    textLabel({
      id: "refreshLabel",
      label: "Botão de atualizar",
      description: "Deixe vazio para voltar ao padrão.",
      max: 80,
      value: cfg.refreshLabel === DEFAULT_LABELS.refreshLabel ? "" : cfg.refreshLabel,
      placeholder: DEFAULT_LABELS.refreshLabel,
    })
  );
}

function buildBehaviorModal(cfg) {
  return modal(
    "sptcfg_modal:behavior",
    "Tempo e mensagem",
    textLabel({
      id: "autoDeleteMinutes",
      label: "Apagar o card após (minutos)",
      description: "0 = não apaga. Máximo: 1440 (24 horas).",
      max: 4,
      value: String(cfg.autoDeleteMinutes),
      placeholder: "0",
    }),
    textLabel({
      id: "notListeningMessage",
      label: "Mensagem de \"não está ouvindo\"",
      description: "Vazio = padrão. Use {user} e {name}.",
      style: TextInputStyle.Paragraph,
      max: 300,
      value: cfg.notListeningMessage,
      placeholder: "{user} não está ouvindo nada no Spotify agora.",
    })
  );
}

module.exports = {
  buildSpotifyHome,
  buildSpotifyUse,
  buildSpotifyLook,
  buildSpotifyButtons,
  buildSpotifyBehavior,
  buildCooldownModal,
  buildLabelsModal,
  buildBehaviorModal,
};
