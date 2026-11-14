const { Schema, model } = require("mongoose");

// Configuração do comando n!spotify por servidor.
// IMPORTANTE: o mongoose descarta campos que não estão declarados aqui (strict mode).
const spotifyConfigSchema = new Schema({
  guildId: { type: String, required: true, unique: true },

  // ----- Controle de uso -----
  enabled: { type: Boolean, default: true },
  allowedChannels: { type: [String], default: [] }, // vazio = todos os canais
  access: { type: String, enum: ["everyone", "roles"], default: "everyone" },
  roles: { type: [String], default: [] }, // cargos que podem usar (modo "roles")
  allowOthers: { type: Boolean, default: true }, // vale n!spotify @pessoa?
  cooldown: { type: Number, default: 0 }, // segundos entre usos por pessoa (0 = sem espera)

  // ----- Aparência do card -----
  barColor: { type: String, enum: ["green", "cover", "custom"], default: "green" },
  showNowPlaying: { type: Boolean, default: true }, // faixa "Ouvindo agora"
  showPill: { type: Boolean, default: true }, // pílula do Spotify
  glass: { type: String, enum: ["dark", "normal", "light"], default: "normal" },

  // Cores (#rrggbb; vazio = padrão)
  barHex: { type: String, default: "" }, // barra de progresso (modo "custom")
  trackHex: { type: String, default: "" }, // parte vazia da barra
  knobHex: { type: String, default: "" }, // bolinha da barra
  titleHex: { type: String, default: "" },
  artistHex: { type: String, default: "" },
  timeHex: { type: String, default: "" },
  pillTextHex: { type: String, default: "" },
  footerTextHex: { type: String, default: "" },
  bgHex: { type: String, default: "" }, // fundo liso/degradê no lugar da capa
  bgHex2: { type: String, default: "" }, // segunda cor do degradê
  shadeHex: { type: String, default: "" }, // cor do escurecimento sobre a capa
  glassHex: { type: String, default: "" }, // cor do vidro das faixas
  containerHex: { type: String, default: "" }, // cor lateral do container da mensagem

  // Formato
  radius: { type: Number, default: 34 }, // arredondamento dos cantos
  blur: { type: Number, default: 22 }, // desfoque do vidro
  barHeight: { type: Number, default: 7 },
  overlay: { type: Number, default: null }, // escurecimento geral em % (null = automático pelo vidro)
  showTimes: { type: Boolean, default: true },
  showKnob: { type: Boolean, default: true },

  // Textos e ícones do card ("" = padrão, "-" = esconder)
  pillText: { type: String, default: "" },
  pillIcon: { type: String, default: "" }, // ID de emoji do Discord ou link https de imagem
  footerText: { type: String, default: "" },
  footerName: { type: String, enum: ["username", "display", "none"], default: "username" },
  showAvatar: { type: Boolean, default: true },

  // ----- Botões e letra -----
  showInfoButton: { type: Boolean, default: true },
  showRefreshButton: { type: Boolean, default: true },
  lyricsSource: { type: String, enum: ["lrclib", "vagalume", "off"], default: "lrclib" },
  linkLabel: { type: String, default: "Abrir no Spotify" },
  infoLabel: { type: String, default: "Informações e letra" },
  refreshLabel: { type: String, default: "Atualizar" },
  linkEmoji: { type: String, default: "" },
  infoEmoji: { type: String, default: "" },
  refreshEmoji: { type: String, default: "" },
  infoStyle: { type: String, enum: ["secondary", "primary", "success", "danger"], default: "secondary" },
  refreshStyle: { type: String, enum: ["secondary", "primary", "success", "danger"], default: "secondary" },

  // Textos do painel de informações ("" = padrão)
  infoArtistLabel: { type: String, default: "" },
  infoAlbumLabel: { type: String, default: "" },
  infoDurationLabel: { type: String, default: "" },
  infoListeningLabel: { type: String, default: "" },
  lyricsTitle: { type: String, default: "" },

  // ----- Comportamento -----
  autoDeleteMinutes: { type: Number, default: 0 }, // 0 = não apaga
  notListeningMessage: { type: String, default: "" }, // vazio = mensagem padrão
});

module.exports = model("SpotifyConfig", spotifyConfigSchema);
