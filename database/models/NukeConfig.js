const { Schema, model } = require("mongoose");

// Configuração do comando "nnuke" (recria o canal do zero) por servidor.
// IMPORTANTE: o mongoose descarta campos que não estão declarados aqui (strict mode).
// Os textos NÃO têm default aqui de propósito: campo ausente = usa o padrão de utils/nuke/defaults.js;
// campo salvo como "" = a pessoa limpou de propósito.
const nukeConfigSchema = new Schema({
  guildId: { type: String, required: true, unique: true },

  enabled: { type: Boolean, default: true },

  // Quem pode usar: "staff" = equipe + cargos/pessoas extras | "roles" = só cargos/pessoas escolhidos | "admin" = só administradores + pessoas escolhidas
  access: { type: String, enum: ["staff", "roles", "admin"], default: "staff" },
  roles: { type: [String], default: [] }, // cargos permitidos
  blockedRoles: { type: [String], default: [] }, // cargos que NUNCA podem usar
  users: { type: [String], default: [] }, // pessoas permitidas (além do modo)

  allowedChannels: { type: [String], default: [] }, // vazio = qualquer canal
  protectedChannels: { type: [String], default: [] }, // canais que nunca podem ser recriados

  cooldown: { type: Number, default: 10 }, // segundos entre usos da mesma pessoa (0 = sem espera)
  autoDeleteSeconds: { type: Number, default: 0 }, // apaga a mensagem do novo canal depois de X segundos (0 = nunca)

  sendLog: { type: Boolean, default: true }, // registra no log de canais
  migrate: { type: Boolean, default: true }, // troca o ID do canal antigo pelo novo nas configurações do bot
  pin: { type: Boolean, default: false }, // fixa a mensagem no canal novo
  pingExecutor: { type: Boolean, default: false }, // notifica quem usou o comando

  // Mensagem enviada no canal novo
  mode: { type: String, enum: ["container", "embed", "text"] }, // ausente = container
  containerText: { type: String },
  text: { type: String },
  embedTitle: { type: String },
  embedDescription: { type: String },
  embedFooter: { type: String },
  embedTimestamp: { type: Boolean, default: false },
  color: { type: String }, // hex; vazio = sem cor (container) / cor padrão (embed)
  thumbnail: { type: String }, // "none" | "avatar" | "server" | link
  image: { type: String }, // link da imagem grande (container e embed)
});

module.exports = model("NukeConfig", nukeConfigSchema);
