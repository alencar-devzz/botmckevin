const { MessageFlags, SlashCommandBuilder, InteractionContextType, PermissionFlagsBits } = require("discord.js");
const ui = require("../ui/addEmoji");
const { createSession, enqueue, parseEmojis, cleanName } = require("../utils/addEmoji/collector");

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const EPHEMERAL = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

// /addemoji: cola emojis de outros servidores (ou envia uma imagem) e abre uma coleta: tudo que a pessoa
// enviar no canal depois também vira emoji do servidor, até ela parar no botão do painel (resposta só dela).
module.exports = {
  name: "addemoji",
  category: "Utilidades",

  data: new SlashCommandBuilder()
    .setName("addemoji")
    .setDescription("Adiciona emojis de outros servidores ao servidor e continua recebendo os que você enviar.")
    .setDefaultMemberPermissions(PermissionFlagsBits.CreateGuildExpressions)
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) =>
      o.setName("emoji").setDescription("Cole um ou mais emojis de outros servidores").setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("nome")
        .setDescription("Nome do emoji (com vários emojis, cada um ganha um número no final)")
        .setMinLength(2)
        .setMaxLength(32)
    )
    .addAttachmentOption((o) =>
      o.setName("arquivo").setDescription("Imagem que também vira emoji (PNG, JPG, GIF ou WEBP, até 256 KB)")
    ),

  async executeSlash(interaction) {
    const reply = (content) =>
      interaction.reply({ components: ui.buildNotice(content), flags: EPHEMERAL, allowedMentions: { parse: [] } });

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.CreateGuildExpressions)) {
      return reply("Você precisa da permissão de criar expressões para usar este comando.");
    }
    if (!interaction.guild?.members?.me?.permissions?.has(PermissionFlagsBits.CreateGuildExpressions)) {
      return reply("Eu não tenho a permissão de criar expressões neste servidor.");
    }

    const pasted = parseEmojis(interaction.options.getString("emoji", true));
    const file = interaction.options.getAttachment("arquivo");
    const jobs = [...pasted];

    if (file) {
      if (IMAGE_TYPES.includes(String(file.contentType ?? "").split(";")[0])) {
        jobs.push({ name: cleanName(String(file.name ?? "emoji").replace(/\.[^.]+$/, "")), url: file.url, size: file.size ?? 0 });
      } else if (!jobs.length) {
        return reply("O arquivo precisa ser uma imagem PNG, JPG, GIF ou WEBP.");
      }
    }

    if (!jobs.length) {
      return reply("Não encontrei nenhum emoji personalizado no que você colou. Cole emojis de outros servidores (os padrões já existem em todos).");
    }

    // O nome vale para o emoji único; com vários, vira prefixo numerado
    const nome = interaction.options.getString("nome");
    if (nome) {
      const base = cleanName(nome);
      jobs.forEach((job, i) => (job.name = jobs.length === 1 ? base : cleanName(`${base}_${i + 1}`)));
    }

    const state = createSession({ interaction });
    state.total = jobs.length;
    await interaction.reply({ components: ui.buildActive(state), flags: EPHEMERAL, allowedMentions: { parse: [] } });
    state.total = 0; // enqueue soma o total
    enqueue(state, jobs);
  },
};
