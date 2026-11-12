// Dá "mais tempo" para os botões responderem à Discord.
//
// A Discord exige que toda interação de botão seja reconhecida (reply/update/
// defer/showModal) em até 3 segundos, senão ela falha com "Unknown interaction".
// Esse módulo cria uma rede de segurança: se o handler de um botão ainda não
// tiver reconhecido a interação depois de ACK_SAFETY_NET_MS, nós mesmos damos
// um deferUpdate() por baixo dos panos. Isso estende o prazo de resposta de 3
// segundos para até 15 minutos — ou seja, um "ganho" de bem mais que 3 segundos
// nos casos em que o handler demoraria demais e falharia.
//
// Depois que esse deferUpdate automático acontece, qualquer chamada que o
// handler fizer a interaction.update(...) ou interaction.reply(...) é
// redirecionada por trás dos panos para editReply(...)/followUp(...), que são
// as formas corretas de responder depois de um defer. Assim nenhum handler
// precisa ser reescrito.
//
// Botões que abrem modal (interaction.showModal) NUNCA são afetados: a Discord
// não permite showModal depois de um defer/reply, então assim que showModal é
// chamado a rede de segurança é cancelada automaticamente e a interação nunca
// é deferida por aqui.

const ACK_SAFETY_NET_MS = 2000; // margem segura antes do limite de 3s da Discord

function attachAckSafetyNet(interaction) {
  // Evita anexar a rede de segurança mais de uma vez na mesma interação.
  if (interaction.__ackSafetyNetAttached) return;
  interaction.__ackSafetyNetAttached = true;

  // Botões não têm showModal/update/deferUpdate garantidos em todo tipo de
  // interação — só seguimos se a interação realmente tiver esses métodos.
  if (typeof interaction.deferUpdate !== "function" || typeof interaction.update !== "function") {
    return;
  }

  let settled = false;
  let deferredByNet = false;
  let timer = null;

  const cancelNet = () => {
    settled = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const originalShowModal = interaction.showModal?.bind(interaction);
  const originalReply = interaction.reply.bind(interaction);
  const originalUpdate = interaction.update.bind(interaction);
  const originalDeferReply = interaction.deferReply.bind(interaction);
  const originalDeferUpdate = interaction.deferUpdate.bind(interaction);
  const originalFollowUp = interaction.followUp.bind(interaction);
  const originalEditReply = interaction.editReply.bind(interaction);

  // Abrir um modal cancela a rede de segurança: esses botões ficam de fora.
  if (originalShowModal) {
    interaction.showModal = (...args) => {
      cancelNet();
      return originalShowModal(...args);
    };
  }

  interaction.deferReply = (...args) => {
    cancelNet();
    return originalDeferReply(...args);
  };

  interaction.deferUpdate = (...args) => {
    cancelNet();
    return originalDeferUpdate(...args);
  };

  interaction.update = (...args) => {
    cancelNet();
    // Se a rede de segurança já deu o deferUpdate, não dá mais para usar
    // update() — a resposta correta agora é editReply().
    if (deferredByNet) return originalEditReply(...args);
    return originalUpdate(...args);
  };

  interaction.reply = (...args) => {
    cancelNet();
    // Mesma lógica: depois do deferUpdate automático, reply() vira followUp().
    if (deferredByNet) return originalFollowUp(...args);
    return originalReply(...args);
  };

  timer = setTimeout(async () => {
    if (settled) return;
    deferredByNet = true;
    try {
      await originalDeferUpdate();
    } catch (err) {
      console.error("[BUTTON SAFETY NET] Falha ao dar tempo extra para o botão:", err);
    }
  }, ACK_SAFETY_NET_MS);

  // Nunca deixa esse timer segurar o processo Node vivo sozinho.
  if (typeof timer.unref === "function") timer.unref();
}

module.exports = { attachAckSafetyNet, ACK_SAFETY_NET_MS };
