const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");
const {
  MAX_OPTIONS,
  getTicketSettings,
  updateTicketConfig,
  parseImageUrls,
} = require("../utils/ticketSettings");
const { sendTicketPanel, refreshTicketPanels } = require("../utils/ticketPanels");
const {
  buildTicketMenuPanel,
  buildPanelExternoCfg,
  buildInternoCfg,
  buildOptionsCfg,
  buildOptionDetail,
  buildRolesCfg,
  buildSendCfg,
} = require("../ui/ticketConfig");
const {
  buildPanelTextModal,
  buildImagesModal,
  buildInternalTextModal,
  buildOptionModal,
} = require("../ui/ticketConfigModals");

const EPHEMERAL = MessageFlags.Ephemeral;

// Só a equipe pode mexer na configuração dos tickets
async function guard(interaction) {
  if (interaction.member?.roles?.cache?.hasAny(...ALL_STAFF_ROLE_IDS)) return true;
  await interaction.reply({
    content: "Você não tem permissão para configurar o sistema de tickets.",
    flags: EPHEMERAL,
  });
  return false;
}

// Atualiza os painéis já enviados em segundo plano (não trava a resposta ao usuário)
function refreshInBackground(interaction, settings) {
  refreshTicketPanels(interaction.client, interaction.guild.id, settings).catch((err) =>
    console.error("[TICKET CONFIG] Erro ao atualizar painéis:", err.message)
  );
}

const clean = (value) => {
  const v = value?.trim();
  return v ? v : null;
};

// ---------- selects ----------

async function handleTicketConfigSelect(interaction) {
  if (!(await guard(interaction))) return;
  const { customId, values } = interaction;
  const guildId = interaction.guild.id;

  switch (customId) {
    case "tcfg_menu": {
      const settings = await getTicketSettings(guildId);
      const panels = {
        painel: buildPanelExternoCfg,
        interno: buildInternoCfg,
        opcoes: buildOptionsCfg,
        cargos: buildRolesCfg,
        enviar: buildSendCfg,
      };
      const build = panels[values[0]];
      if (!build) return;
      return interaction.update({ components: build(settings) });
    }

    case "tcfg_opt_select": {
      const settings = await getTicketSettings(guildId);
      const option = settings.options.find((o) => o.key === values[0]);
      if (!option) return interaction.update({ components: buildOptionsCfg(settings) });
      return interaction.update({ components: buildOptionDetail(settings, option) });
    }

    case "tcfg_role_attend": {
      const settings = await updateTicketConfig(guildId, { attendRoles: values });
      return interaction.update({ components: buildRolesCfg(settings) });
    }

    case "tcfg_role_mention": {
      const settings = await updateTicketConfig(guildId, { mentionRoles: values });
      return interaction.update({ components: buildRolesCfg(settings) });
    }

    case "tcfg_send_channel": {
      await interaction.deferUpdate();
      const channel = interaction.guild.channels.cache.get(values[0]);
      const perms = channel?.permissionsFor(interaction.guild.members.me);
      const needed = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.CreatePrivateThreads,
        PermissionFlagsBits.SendMessagesInThreads,
      ];

      let settings = await getTicketSettings(guildId);
      if (!channel || !perms?.has(needed)) {
        return interaction.editReply({
          components: buildSendCfg(
            settings,
            "Não consegui enviar: preciso de permissão para ver o canal, enviar mensagens, criar tópicos privados e enviar mensagens em tópicos."
          ),
        });
      }

      try {
        await sendTicketPanel(channel);
        settings = await getTicketSettings(guildId);
        return interaction.editReply({
          components: buildSendCfg(settings, `Painel enviado em <#${channel.id}>.`),
        });
      } catch (err) {
        console.error("[TICKET CONFIG] Erro ao enviar painel:", err);
        return interaction.editReply({
          components: buildSendCfg(settings, "Não consegui enviar o painel nesse canal."),
        });
      }
    }

    default:
      return;
  }
}

// ---------- botões ----------

async function handleTicketConfigButton(interaction) {
  if (!(await guard(interaction))) return;
  const [action, key] = interaction.customId.split(":");
  const guildId = interaction.guild.id;

  switch (action) {
    case "tcfg_back":
      return interaction.update({ components: buildTicketMenuPanel() });

    case "tcfg_back_opts": {
      const settings = await getTicketSettings(guildId);
      return interaction.update({ components: buildOptionsCfg(settings) });
    }

    case "tcfg_panel_text": {
      const settings = await getTicketSettings(guildId);
      return interaction.showModal(buildPanelTextModal(settings));
    }

    case "tcfg_panel_images": {
      const settings = await getTicketSettings(guildId);
      return interaction.showModal(
        buildImagesModal({
          customId: "tcfg_modal_panel_images",
          title: "Imagens do painel externo",
          current: settings.custom.panelImages ? settings.panelImages : [],
          emptyHint: "vazio = imagem padrão",
        })
      );
    }

    case "tcfg_int_text": {
      const settings = await getTicketSettings(guildId);
      return interaction.showModal(buildInternalTextModal(settings));
    }

    case "tcfg_int_images": {
      const settings = await getTicketSettings(guildId);
      return interaction.showModal(
        buildImagesModal({
          customId: "tcfg_modal_int_images",
          title: "Imagens do ticket interno",
          current: settings.internalImages,
          emptyHint: "vazio = sem imagens",
        })
      );
    }

    case "tcfg_opt_add": {
      const settings = await getTicketSettings(guildId);
      if (settings.options.length >= MAX_OPTIONS) {
        return interaction.reply({
          content: `O limite é de ${MAX_OPTIONS} opções.`,
          flags: EPHEMERAL,
        });
      }
      return interaction.showModal(
        buildOptionModal({ customId: "tcfg_modal_opt_add", title: "Nova opção" })
      );
    }

    case "tcfg_opt_edit": {
      const settings = await getTicketSettings(guildId);
      const option = settings.options.find((o) => o.key === key);
      if (!option) return interaction.update({ components: buildOptionsCfg(settings) });
      return interaction.showModal(
        buildOptionModal({
          customId: `tcfg_modal_opt_edit:${key}`,
          title: "Editar opção",
          option,
        })
      );
    }

    case "tcfg_opt_del": {
      const current = await getTicketSettings(guildId);
      if (current.options.length <= 1) {
        return interaction.reply({
          content: "O painel precisa ter pelo menos uma opção.",
          flags: EPHEMERAL,
        });
      }
      const settings = await updateTicketConfig(guildId, {
        options: current.options.filter((o) => o.key !== key),
      });
      await interaction.update({ components: buildOptionsCfg(settings) });
      return refreshInBackground(interaction, settings);
    }

    case "tcfg_roles_reset": {
      const settings = await updateTicketConfig(guildId, {}, ["attendRoles", "mentionRoles"]);
      return interaction.update({ components: buildRolesCfg(settings) });
    }

    default:
      return;
  }
}

// ---------- modais ----------

async function handleTicketConfigModal(interaction) {
  if (!(await guard(interaction))) return;
  const [action, key] = interaction.customId.split(":");
  const guildId = interaction.guild.id;
  const field = (id) => interaction.fields.getTextInputValue(id);

  switch (action) {
    case "tcfg_modal_panel_text": {
      const settings = await updateTicketConfig(guildId, {
        panelTitle: clean(field("panel_title")),
        panelDescription: clean(field("panel_description")),
        panelPlaceholder: clean(field("panel_placeholder")),
      });
      await interaction.update({ components: buildPanelExternoCfg(settings) });
      return refreshInBackground(interaction, settings);
    }

    case "tcfg_modal_panel_images": {
      const raw = field("images");
      const { urls, invalid } = parseImageUrls(raw);
      if (clean(raw) && !urls.length) {
        return interaction.reply({
          content: "Nenhum link válido. Envie links que começam com http:// ou https://",
          flags: EPHEMERAL,
        });
      }
      const settings = await updateTicketConfig(guildId, { panelImages: urls });
      await interaction.update({ components: buildPanelExternoCfg(settings) });
      refreshInBackground(interaction, settings);
      if (invalid) {
        await interaction
          .followUp({
            content: `${invalid} link(s) foram ignorados (inválidos ou acima do limite).`,
            flags: EPHEMERAL,
          })
          .catch(() => {});
      }
      return;
    }

    case "tcfg_modal_int_text": {
      const settings = await updateTicketConfig(guildId, {
        internalHeading: clean(field("int_heading")),
        internalMessage: clean(field("int_message")),
        claimedMessage: clean(field("int_claimed")),
        threadName: clean(field("int_thread")),
      });
      return interaction.update({ components: buildInternoCfg(settings) });
    }

    case "tcfg_modal_int_images": {
      const raw = field("images");
      const { urls, invalid } = parseImageUrls(raw);
      if (clean(raw) && !urls.length) {
        return interaction.reply({
          content: "Nenhum link válido. Envie links que começam com http:// ou https://",
          flags: EPHEMERAL,
        });
      }
      const settings = await updateTicketConfig(guildId, { internalImages: urls });
      await interaction.update({ components: buildInternoCfg(settings) });
      if (invalid) {
        await interaction
          .followUp({
            content: `${invalid} link(s) foram ignorados (inválidos ou acima do limite).`,
            flags: EPHEMERAL,
          })
          .catch(() => {});
      }
      return;
    }

    case "tcfg_modal_opt_add": {
      const current = await getTicketSettings(guildId);
      if (current.options.length >= MAX_OPTIONS) {
        return interaction.reply({
          content: `O limite é de ${MAX_OPTIONS} opções.`,
          flags: EPHEMERAL,
        });
      }
      const label = field("opt_label").trim();
      const option = {
        key: `o${Date.now().toString(36)}`,
        label,
        description: clean(field("opt_description")),
        title: clean(field("opt_title")) ?? label.toUpperCase(),
        message: clean(field("opt_message")),
      };
      const settings = await updateTicketConfig(guildId, {
        options: [...current.options, option],
      });
      await interaction.update({ components: buildOptionsCfg(settings) });
      return refreshInBackground(interaction, settings);
    }

    case "tcfg_modal_opt_edit": {
      const current = await getTicketSettings(guildId);
      const existing = current.options.find((o) => o.key === key);
      if (!existing) return interaction.update({ components: buildOptionsCfg(current) });

      const label = field("opt_label").trim();
      const updated = {
        key,
        label,
        description: clean(field("opt_description")),
        title: clean(field("opt_title")) ?? label.toUpperCase(),
        message: clean(field("opt_message")),
      };
      const settings = await updateTicketConfig(guildId, {
        options: current.options.map((o) => (o.key === key ? updated : o)),
      });
      await interaction.update({ components: buildOptionDetail(settings, updated) });
      return refreshInBackground(interaction, settings);
    }

    default:
      return;
  }
}

module.exports = {
  handleTicketConfigSelect,
  handleTicketConfigButton,
  handleTicketConfigModal,
};
