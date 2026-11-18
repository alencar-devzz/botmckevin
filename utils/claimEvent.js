const mongoose = require("mongoose");

// Trava anti-duplicação entre instâncias.
//
// Num deploy/reinício da Render, a instância antiga continua rodando por cerca de 60s depois que a
// nova assume. Nesse tempo as duas estão logadas com o mesmo token e as duas recebem a mesma
// mensagem. Cada instância tenta "reivindicar" o ID da mensagem no MongoDB: só quem conseguir
// inserir primeiro processa; a outra ignora. Os registros se apagam sozinhos (TTL de 2 minutos).
const claimSchema = new mongoose.Schema(
  {
    _id: { type: String },
    createdAt: { type: Date, default: Date.now, expires: 120 },
  },
  { versionKey: false },
);

const EventClaim = mongoose.models.EventClaim ?? mongoose.model("EventClaim", claimSchema);

// Retorna true se esta instância deve processar o evento; false se outra instância já pegou.
// Se o banco falhar, retorna true (melhor responder em dobro do que não responder).
async function claimEvent(key) {
  try {
    await EventClaim.create({ _id: String(key) });
    return true;
  } catch (err) {
    if (err?.code === 11000) return false;
    console.error("[CLAIM] Erro ao reivindicar evento (seguindo sem a trava):", err?.message ?? err);
    return true;
  }
}

module.exports = { claimEvent };
