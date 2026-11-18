const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

// Navegação do Criador de mensagens quando ele é aberto pelo /menu (Outros > Criador de mensagens).
// Linha fora do container: [Voltar] [Avançar] [Home]. Voltar/Avançar andam pelas telas já visitadas;
// o Voltar da primeira tela leva para o painel "Outros" e o Home leva para o painel principal.
const HOME_EMOJI = { name: "home", id: "1570991310612201482" };
const MAX_HISTORY = 40;
const MAX_MESSAGES = 300;

const histories = new Map(); // messageId -> { stack: [view], index }

function get(messageId) {
  let h = histories.get(messageId);
  if (!h) {
    h = { stack: [], index: -1 };
    histories.set(messageId, h);
    if (histories.size > MAX_MESSAGES) histories.delete(histories.keys().next().value);
  }
  return h;
}

// Registra a tela atual ("menuhome" = tela inicial do criador, as demais são chaves de VIEWS)
function record(messageId, view) {
  const h = get(messageId);
  if (h.stack[h.index] === view) return;
  h.stack = h.stack.slice(0, h.index + 1);
  h.stack.push(view);
  if (h.stack.length > MAX_HISTORY) h.stack.shift();
  h.index = h.stack.length - 1;
}

// Move no histórico: devolve a tela de destino, ou null se não há mais para onde ir
function move(messageId, delta) {
  const h = get(messageId);
  const to = h.index + delta;
  if (to < 0 || to >= h.stack.length) return null;
  h.index = to;
  return h.stack[to];
}

const reset = (messageId) => histories.delete(messageId);

function navRow(messageId) {
  const h = get(messageId);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("msg:hist:back").setLabel("Voltar").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("msg:hist:fwd")
      .setLabel("Avançar")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(h.index >= h.stack.length - 1),
    new ButtonBuilder().setCustomId("msg:hist:home").setEmoji(HOME_EMOJI).setStyle(ButtonStyle.Secondary)
  );
}

module.exports = { record, move, reset, navRow };
