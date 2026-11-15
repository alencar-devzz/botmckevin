const { getSession, finalize } = require("../utils/addEmoji/collector");
const ui = require("../ui/addEmoji");

const NO_MENTIONS = { parse: [] };

// Botão do painel do /addemoji (customId "emj:<sessão>:stop")
async function handleEmojiButton(interaction) {
  const [, sid, action] = interaction.customId.split(":");
  const state = getSession(sid);

  if (!state || state.userId !== interaction.user.id) {
    return interaction.update({
      components: ui.buildNotice(state ? "Você não pode usar este painel." : "Este painel já foi encerrado."),
      allowedMentions: NO_MENTIONS,
    });
  }

  if (action === "stop") {
    // Termina o que já está na fila antes de mostrar o resultado final
    await interaction.deferUpdate();
    const payload = await finalize(state, "stop");
    return interaction.editReply(payload);
  }
}

module.exports = { handleEmojiButton };
