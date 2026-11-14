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
const { DEFAULT_LABELS, DEFAULT_INFO_LABELS } = require("../utils/spotify/store");
const { THEMES, visualCustomCount } = require("../utils/spotify/themes");

// Painéis do menu: Comunidade e interação → Comando spotify

const text = (content) => new TextDisplayBuilder().setContent(String(content).slice(0, 3000));
const btn = (id, label, style = ButtonStyle.Secondary) =>
  new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
const yesNo = (value) => (value ? "Sim" : "Não");
const row = (...components) => new ActionRowBuilder().addComponents(...components);

const ACCESS_LABEL = { everyone: "Todos os membros", roles: "Somente os cargos escolhidos" };
const BAR_LABEL = { green: "Verde do Spotify", cover: "Cor tirada da capa", custom: "Cor personalizada" };
const BAR_SHORT = { green: "Verde", cover: "Capa", custom: "Personalizada" };
const STYLE_LABEL = { secondary: "Cinza", primary: "Azul", success: "Verde", danger: "Vermelho" };
const NAME_LABEL = { username: "Nome de usuário", display: "Apelido do servidor", none: "Nenhum" };
const hexView = (value) => (value ? `\`${value}\`` : "`padrão`");
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
        `**Visual personalizado:** ${visualCustomCount(cfg) ? `${visualCustomCount(cfg)} ajuste(s) em cores e formato` : "padrão"}`,
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
    text("-# Escolha um tema pronto ou personalize cada parte. Use \"Pré-visualizar\" para ver antes de usar no servidor.")
  );

  const glass = new StringSelectMenuBuilder()
    .setCustomId("sptcfg_glass")
    .setPlaceholder("Intensidade do vidro")
    .addOptions(
      { label: "Mais escuro", description: "Faixas bem escuras por cima da capa.", value: "dark", default: cfg.glass === "dark" },
      { label: "Padrão", description: "Equilíbrio entre capa e legibilidade.", value: "normal", default: cfg.glass === "normal" },
      { label: "Mais claro", description: "Vidro leve, deixa a capa aparecer mais.", value: "light", default: cfg.glass === "light" }
    );

  const themes = new StringSelectMenuBuilder()
    .setCustomId("sptcfg_theme")
    .setPlaceholder("Aplicar um tema pronto")
    .addOptions(Object.entries(THEMES).map(([value, t]) => ({ label: t.label, description: t.description, value })));

  const barNote = cfg.barColor === "custom" ? ` (${cfg.barHex})` : "";
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text("**Temas prontos**"),
      text("-# Troca cores, vidro e formato de uma vez (textos, ícones e botões não mudam). Depois dá para ajustar cada detalhe.")
    )
    .addActionRowComponents(row(themes))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      text("**Barra e elementos**"),
      text(`-# Barra: **${BAR_LABEL[cfg.barColor]}**${barNote}. Na cor da capa, capa cinza = barra verde.`)
    )
    .addActionRowComponents(
      row(
        btn("sptcfg_bar", `Barra: ${BAR_SHORT[cfg.barColor]}`),
        btn("sptcfg_pill", `Pílula: ${yesNo(cfg.showPill)}`),
        btn("sptcfg_nowplaying", `Faixa Ouvindo agora: ${yesNo(cfg.showNowPlaying)}`)
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(text("**Intensidade do vidro**"))
    .addActionRowComponents(row(glass))
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      row(
        btn("sptcfg_page:colors", "Cores"),
        btn("sptcfg_page:texts", "Textos e ícones"),
        btn("sptcfg_page:shape", "Formato"),
        btn("sptcfg_preview", "Pré-visualizar", ButtonStyle.Primary)
      )
    );
  addBackButton(container, "sptcfg_home");

  return [header, container];
}

// ---------- Cores ----------

function buildSpotifyColors(cfg) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Cores do card"),
    text("-# Códigos no formato `#rrggbb` (ou `#rgb`). Campo vazio = cor padrão.")
  );

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text("**Cores atuais**"),
      text(
        [
          `**Barra:** ${BAR_LABEL[cfg.barColor]}${cfg.barHex ? ` ${hexView(cfg.barHex)}` : ""} · **Trilho:** ${hexView(cfg.trackHex)} · **Bolinha:** ${hexView(cfg.knobHex)}`,
          `**Título:** ${hexView(cfg.titleHex)} · **Artistas:** ${hexView(cfg.artistHex)} · **Tempos:** ${hexView(cfg.timeHex)}`,
          `**Texto da pílula:** ${hexView(cfg.pillTextHex)} · **Texto da faixa inferior:** ${hexView(cfg.footerTextHex)}`,
          `**Fundo:** ${cfg.bgHex ? `${hexView(cfg.bgHex)}${cfg.bgHex2 ? ` → ${hexView(cfg.bgHex2)}` : " (liso)"} (no lugar da capa)` : "`capa da música`"}`,
          `**Escurecimento:** ${hexView(cfg.shadeHex)} · **Vidro:** ${hexView(cfg.glassHex)} · **Cor lateral da mensagem:** ${hexView(cfg.containerHex)}`,
        ].join("\n")
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      row(
        btn("sptcfg_edit:colors_bar", "Barra e bolinha"),
        btn("sptcfg_edit:colors_text", "Textos"),
        btn("sptcfg_edit:colors_bg", "Fundo e vidro")
      )
    )
    .addActionRowComponents(
      row(btn("sptcfg_preview", "Pré-visualizar", ButtonStyle.Primary), btn("sptcfg_resetcolors", "Restaurar cores", ButtonStyle.Danger))
    );
  addBackButton(container, "sptcfg_page:look");

  return [header, container];
}

// ---------- Formato ----------

function buildSpotifyShape(cfg) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Formato do card"),
    text("-# Cantos, desfoque, espessura da barra e quais partes da barra aparecem.")
  );

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text("**Formato atual**"),
      text(
        [
          `**Cantos:** \`${cfg.radius}\` · **Desfoque do vidro:** \`${cfg.blur}\` · **Espessura da barra:** \`${cfg.barHeight}\``,
          `**Escurecimento geral:** ${cfg.overlay == null ? "`automático (pelo vidro)`" : `\`${cfg.overlay}%\``}`,
          `**Tempos (01:23 / 03:35):** ${yesNo(cfg.showTimes)} · **Bolinha da barra:** ${yesNo(cfg.showKnob)}`,
        ].join("\n")
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      row(
        btn("sptcfg_edit:shape", "Editar formato"),
        btn("sptcfg_times", `Tempos: ${yesNo(cfg.showTimes)}`),
        btn("sptcfg_knob", `Bolinha: ${yesNo(cfg.showKnob)}`)
      )
    )
    .addActionRowComponents(
      row(btn("sptcfg_preview", "Pré-visualizar", ButtonStyle.Primary), btn("sptcfg_resetshape", "Restaurar formato", ButtonStyle.Danger))
    );
  addBackButton(container, "sptcfg_page:look");

  return [header, container];
}

// ---------- Textos e ícones ----------

function buildSpotifyTexts(cfg) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Textos e ícones"),
    text("-# Textos da imagem do card e do painel de informações. Nos campos de texto, vazio = padrão e `-` = esconder.")
  );

  const iconView = cfg.pillIcon === "-" ? "`sem ícone`" : cfg.pillIcon ? inline(cfg.pillIcon, 40) : "`ícone do Spotify`";
  const info = [
    cfg.infoArtistLabel !== DEFAULT_INFO_LABELS.infoArtistLabel,
    cfg.infoAlbumLabel !== DEFAULT_INFO_LABELS.infoAlbumLabel,
    cfg.infoDurationLabel !== DEFAULT_INFO_LABELS.infoDurationLabel,
    cfg.infoListeningLabel !== DEFAULT_INFO_LABELS.infoListeningLabel,
    cfg.lyricsTitle !== DEFAULT_INFO_LABELS.lyricsTitle,
  ].filter(Boolean).length;

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text("**Textos atuais**"),
      text(
        [
          `**Pílula:** ${cfg.pillText === "-" ? "`sem texto`" : inline(cfg.pillText)} · **Ícone:** ${iconView}`,
          `**Faixa inferior:** ${cfg.footerText === "-" ? "`sem texto`" : inline(cfg.footerText)} · **Nome:** ${NAME_LABEL[cfg.footerName]} · **Foto:** ${yesNo(cfg.showAvatar)}`,
          `**Painel de informações:** ${info ? `${info} texto(s) alterado(s)` : "`textos padrão`"}`,
          "-# O nome em \"Apelido do servidor\" pode ter símbolos ou emojis que a fonte do card não desenha; o nome de usuário é o mais seguro.",
        ].join("\n")
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      row(btn("sptcfg_edit:texts_card", "Pílula e faixa inferior"), btn("sptcfg_edit:texts_info", "Painel de informações"))
    )
    .addActionRowComponents(
      row(
        btn("sptcfg_avatar", `Foto: ${yesNo(cfg.showAvatar)}`),
        btn("sptcfg_name", `Nome: ${NAME_LABEL[cfg.footerName]}`)
      )
    )
    .addActionRowComponents(
      row(btn("sptcfg_preview", "Pré-visualizar", ButtonStyle.Primary), btn("sptcfg_resettexts", "Restaurar textos", ButtonStyle.Danger))
    );
  addBackButton(container, "sptcfg_page:look");

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
    .addActionRowComponents(
      row(
        btn("sptcfg_style:info", `Cor do Informações: ${STYLE_LABEL[cfg.infoStyle]}`),
        btn("sptcfg_style:refresh", `Cor do Atualizar: ${STYLE_LABEL[cfg.refreshStyle]}`),
        btn("sptcfg_edit:btn_emoji", "Emojis dos botões")
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
      text(
        `Link: ${[cfg.linkEmoji, inline(cfg.linkLabel, 40)].filter(Boolean).join(" ")} · Informações: ${[cfg.infoEmoji, inline(cfg.infoLabel, 40)].filter(Boolean).join(" ")} · Atualizar: ${[cfg.refreshEmoji, inline(cfg.refreshLabel, 40)].filter(Boolean).join(" ")}`
      )
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

// ---------- Modais declarativos (cores, formato, textos, emojis) ----------
// type: hex | int | intOrEmpty | text | icon | emoji. O handler usa as mesmas definições para ler e validar.
const MODALS = {
  colors_bar: {
    title: "Barra e bolinha",
    page: "colors",
    fields: [
      { id: "barHex", type: "hex", label: "Cor da barra de progresso", description: "#rrggbb. Preencher ativa a barra personalizada.", placeholder: "#1ed760" },
      { id: "trackHex", type: "hex", label: "Trilho (parte ainda não tocada)", description: "Vazio = branco translúcido.", placeholder: "#444444" },
      { id: "knobHex", type: "hex", label: "Bolinha da barra", description: "Vazio = branca.", placeholder: "#ffffff" },
    ],
  },
  colors_text: {
    title: "Cores dos textos",
    page: "colors",
    fields: [
      { id: "titleHex", type: "hex", label: "Título da música", placeholder: "#ffffff" },
      { id: "artistHex", type: "hex", label: "Artistas", placeholder: "#cccccc" },
      { id: "timeHex", type: "hex", label: "Tempos (01:23 e 03:35)", placeholder: "#ffffff" },
      { id: "pillTextHex", type: "hex", label: "Texto da pílula", placeholder: "#ffffff" },
      { id: "footerTextHex", type: "hex", label: "Texto da faixa inferior", placeholder: "#ffffff" },
    ],
  },
  colors_bg: {
    title: "Fundo, vidro e mensagem",
    page: "colors",
    fields: [
      { id: "bgHex", type: "hex", label: "Fundo no lugar da capa", description: "Vazio = usa a capa da música.", placeholder: "#161616" },
      { id: "bgHex2", type: "hex", label: "Segunda cor do degradê", description: "Só vale com o fundo acima. Vazio = fundo liso.", placeholder: "#262626" },
      { id: "shadeHex", type: "hex", label: "Cor do escurecimento", description: "Vazio = preto.", placeholder: "#000000" },
      { id: "glassHex", type: "hex", label: "Cor do vidro das faixas", description: "Vazio = preto.", placeholder: "#000000" },
      { id: "containerHex", type: "hex", label: "Cor lateral da mensagem", description: "Faixa colorida do container. Vazio = sem cor.", placeholder: "#1ed760" },
    ],
  },
  shape: {
    title: "Formato do card",
    page: "shape",
    fields: [
      { id: "radius", type: "int", min: 0, max: 60, label: "Cantos arredondados (0 a 60)", description: "Padrão: 34.", placeholder: "34" },
      { id: "blur", type: "int", min: 0, max: 40, label: "Desfoque do vidro (0 a 40)", description: "Padrão: 22.", placeholder: "22" },
      { id: "barHeight", type: "int", min: 3, max: 16, label: "Espessura da barra (3 a 16)", description: "Padrão: 7.", placeholder: "7" },
      { id: "overlay", type: "intOrEmpty", min: 0, max: 90, label: "Escurecimento geral (0 a 90)", description: "Vazio = automático pela intensidade do vidro.", placeholder: "22" },
    ],
  },
  texts_card: {
    title: "Pílula e faixa inferior",
    page: "texts",
    fields: [
      { id: "pillText", type: "text", max: 20, label: "Texto da pílula", description: "Vazio = \"Spotify\". Use - para esconder o texto.", placeholder: "Spotify" },
      { id: "pillIcon", type: "icon", max: 300, label: "Ícone da pílula", description: "ID ou <:emoji:id> do Discord, ou link https. - = sem ícone.", placeholder: "1571194086109487216" },
      { id: "footerText", type: "text", max: 30, label: "Texto da faixa inferior", description: "Vazio = \"Ouvindo agora:\". Use - para esconder.", placeholder: "Ouvindo agora:" },
    ],
  },
  texts_info: {
    title: "Textos do painel de informações",
    page: "texts",
    fields: [
      { id: "infoArtistLabel", type: "text", max: 30, label: "Rótulo dos artistas", description: "Vazio = padrão.", placeholder: DEFAULT_INFO_LABELS.infoArtistLabel },
      { id: "infoAlbumLabel", type: "text", max: 30, label: "Rótulo do álbum", description: "Vazio = padrão.", placeholder: DEFAULT_INFO_LABELS.infoAlbumLabel },
      { id: "infoDurationLabel", type: "text", max: 30, label: "Rótulo da duração", description: "Vazio = padrão.", placeholder: DEFAULT_INFO_LABELS.infoDurationLabel },
      { id: "infoListeningLabel", type: "text", max: 30, label: "Rótulo de quem está ouvindo", description: "Vazio = padrão.", placeholder: DEFAULT_INFO_LABELS.infoListeningLabel },
      { id: "lyricsTitle", type: "text", max: 30, label: "Título da letra", description: "Vazio = padrão.", placeholder: DEFAULT_INFO_LABELS.lyricsTitle },
    ],
  },
  btn_emoji: {
    title: "Emojis dos botões",
    page: "buttons",
    fields: [
      { id: "linkEmoji", type: "emoji", max: 60, label: "Emoji do botão de link", description: "Emoji comum ou <:nome:id>. Vazio = sem emoji.", placeholder: "🎧" },
      { id: "infoEmoji", type: "emoji", max: 60, label: "Emoji do botão de informações", description: "Vazio = sem emoji.", placeholder: "ℹ️" },
      { id: "refreshEmoji", type: "emoji", max: 60, label: "Emoji do botão de atualizar", description: "Vazio = sem emoji.", placeholder: "🔄" },
    ],
  },
};

// Valor inicial de cada campo (mostra só o que foi personalizado)
function fieldValue(field, cfg) {
  const value = cfg[field.id];
  if (value == null) return "";
  if (field.type === "text") {
    const def = DEFAULT_INFO_LABELS[field.id];
    return def && value === def ? "" : String(value);
  }
  return String(value);
}

function buildFieldsModal(kind, cfg) {
  const spec = MODALS[kind];
  return modal(
    `sptcfg_modal:${kind}`,
    spec.title,
    ...spec.fields.map((f) =>
      textLabel({
        id: f.id,
        label: f.label,
        description: f.description,
        max: f.type === "hex" ? 7 : f.type === "int" || f.type === "intOrEmpty" ? 3 : f.max,
        value: fieldValue(f, cfg),
        placeholder: f.placeholder,
      })
    )
  );
}

module.exports = {
  buildSpotifyHome,
  buildSpotifyUse,
  buildSpotifyLook,
  buildSpotifyColors,
  buildSpotifyShape,
  buildSpotifyTexts,
  buildSpotifyButtons,
  buildSpotifyBehavior,
  MODALS,
  buildFieldsModal,
  buildCooldownModal,
  buildLabelsModal,
  buildBehaviorModal,
};
