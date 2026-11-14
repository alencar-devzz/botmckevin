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
  barColor: { type: String, enum: ["green", "cover"], default: "green" },
  showNowPlaying: { type: Boolean, default: true }, // faixa "Ouvindo agora"
  showPill: { type: Boolean, default: true }, // pílula do Spotify
  glass: { type: String, enum: ["dark", "normal", "light"], default: "normal" },

  // ----- Botões e letra -----
  showInfoButton: { type: Boolean, default: true },
  showRefreshButton: { type: Boolean, default: true },
  lyricsSource: { type: String, enum: ["lrclib", "vagalume", "off"], default: "lrclib" },
  linkLabel: { type: String, default: "Abrir no Spotify" },
  infoLabel: { type: String, default: "Informações e letra" },
  refreshLabel: { type: String, default: "Atualizar" },

  // ----- Comportamento -----
  autoDeleteMinutes: { type: Number, default: 0 }, // 0 = não apaga
  notListeningMessage: { type: String, default: "" }, // vazio = mensagem padrão
});

module.exports = model("SpotifyConfig", spotifyConfigSchema);
