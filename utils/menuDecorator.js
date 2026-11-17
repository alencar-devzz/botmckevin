const { decorateComponents } = require("../ui/breadcrumb");

// Intercepta as respostas (update, reply, editReply, followUp) de botões, selects e modais e passa os
// components por ui/breadcrumb.js: subtítulo "Painel > ..." no título e botão Voltar fora do container.
// Telas que não são do /menu não mudam. O /sorteio fica de fora de propósito (visual próprio).
const METHODS = ["update", "reply", "editReply", "followUp"];

function decorateOptions(options) {
  if (!options || typeof options !== "object" || !Array.isArray(options.components)) return options;
  try {
    return { ...options, components: decorateComponents(options.components) };
  } catch (err) {
    // Se algo der errado aqui, a tela original é enviada normalmente
    console.error("[MENU] Falha ao montar subtítulo/Voltar:", err?.message ?? err);
    return options;
  }
}

function installMenuDecorator(interaction) {
  if (interaction.__menuDecorated) return;
  if (String(interaction.customId ?? "").startsWith("sr:")) return;
  interaction.__menuDecorated = true;

  for (const method of METHODS) {
    if (typeof interaction[method] !== "function") continue;
    const original = interaction[method].bind(interaction);
    interaction[method] = (options, ...rest) => original(decorateOptions(options), ...rest);
  }
}

module.exports = { installMenuDecorator, decorateOptions };
