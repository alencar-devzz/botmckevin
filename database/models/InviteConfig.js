const { Schema, model } = require("mongoose");

// Configuração do sistema de convites (comando /convites) por servidor, acessível pelo n!menu
// em Comunidade e interação > Convites.
// IMPORTANTE: o mongoose descarta campos que não estão declarados aqui (strict mode).

const rewardSchema = new Schema(
  {
    roleId: { type: String, required: true },
    invites: { type: Number, required: true }, // quantidade de convites válidos necessária
  },
  { _id: false }
);

const bonusSchema = new Schema(
  {
    userId: { type: String, required: true },
    amount: { type: Number, default: 0 }, // soma (ou subtrai, se negativo) aos convites válidos da pessoa
  },
  { _id: false }
);

const inviteConfigSchema = new Schema({
  guildId: { type: String, required: true, unique: true },

  enabled: { type: Boolean, default: true }, // desligado = novas entradas não contam mais convites

  fakeDays: { type: Number, default: 7 }, // idade mínima da conta em dias. 0 = detecção de fake desligada

  achievementsChannelId: { type: String, default: null }, // onde avisa quando alguém ganha um cargo de recompensa
  announceRewards: { type: Boolean, default: true },

  rewards: { type: [rewardSchema], default: [] }, // cargos por quantidade de convites válidos
  bonuses: { type: [bonusSchema], default: [] }, // ajustes manuais por pessoa

  rewardsGranted: { type: Number, default: 0 }, // contador: quantos cargos já foram entregues
});

module.exports = model("InviteConfig", inviteConfigSchema);
