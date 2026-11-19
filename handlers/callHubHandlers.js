const { MessageFlags, PermissionFlagsBits, ChannelType } = require("discord.js");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");
const { getPrefix } = require("../utils/getPrefix");
const { DEFAULT_TEXTS, SECTIONS, TEXT_KEYS, BUTTON_KEYS, DEFAULT_STYLES, STYLE_LABELS } = require("../utils/callHubDefaults");
const {
  getCallHubConfig,
  updateCallHubConfig,
  resetCallHubConfig,
  wipeCallHubConfig,
} = require("../utils/callHubStore");
const {
  humansIn,
  getOwner,
  setOwner,
  getProfile,
  updateProfile,
  isLocked,
  allowedMemberIds,
  blockedMemberIds,
  allowUser,
  denyUser,
  clearUser,
  unblockUser,
  setLocked,
  applyLock,
} = require("../utils/callHub");
const {
  buildCallHubHome,
  buildCallHubAccess,
  buildCallHubLook,
  buildMainModal,
  buildSectionModal,
  buildCallHubMessages,
  buildMessageModal,
  buildCallHubButtons,
  buildButtonModal,
} = require("../ui/callHubConfig");
const { buildCallPanel, buildNotice, buildPicker, buildMemberPicker, buildLimitModal } = require("../ui/callPanel");
const { say, MESSAGES, MESSAGE_KEYS, DEFAULT_MESSAGES } = require("../utils/callHubMessages");

const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL = MessageFlags.Ephemeral;

const reply = (interaction, content) =>
  interaction.reply({ components: buildNotice(content), flags: V2 | EPHEMERAL });

// =====================================================================
//  CONFIGURAÇÃO (n!menu → Comunidade e interação → Gerenciador de calls)
// =====================================================================

// Quem configura: Administrador ou cargos da equipe
async function guard(interaction) {
  const member = interaction.member;
  const allowed =
    member?.permissions?.has(PermissionFlagsBits.Administrator) ||
    member?.roles?.cache?.hasAny(...ALL_STAFF_ROLE_IDS);
  if (allowed) return true;

  await interaction.reply({
    content: "Você não tem permissão para configurar o gerenciador de calls.",
    flags: EPHEMERAL,
  });
  return false;
}

const deny = (interaction, content) => {
  const payload = { content, flags: EPHEMERAL };
  return interaction.replied || interaction.deferred ? interaction.followUp(payload) : interaction.reply(payload);
};

const homePanel = async (guild) =>
  buildCallHubHome(guild, await getCallHubConfig(guild.id), await getPrefix(guild.id));
const accessPanel = async (guild) => buildCallHubAccess(guild, await getCallHubConfig(guild.id));
const buttonsPanel = async (guild) => buildCallHubButtons(guild, await getCallHubConfig(guild.id));
const messagesPanel = async (guild) => buildCallHubMessages(guild, await getCallHubConfig(guild.id));
const lookPanel = async (guild) =>
  buildCallHubLook(guild, await getCallHubConfig(guild.id), await getPrefix(guild.id));

async function openCallHubPanel(interaction) {
  if (!(await guard(interaction))) return;
  return interaction.update({ components: await homePanel(interaction.guild) });
}

// Botões que apenas alternam um campo
const TOGGLES = {
  chcfg_toggle: "enabled",
};

// Liga/desliga partes do visual do painel (página "Painel da call")
const UI_TOGGLES = {
  legend: ["panelLegend", "legend"],
  dividers: ["panelDividers", "dividers"],
};

async function handleCallHubConfigButton(interaction) {
  if (!(await guard(interaction))) return;
  const { guild } = interaction;
  const [action, arg] = interaction.customId.split(":");
  const cfg = await getCallHubConfig(guild.id);

  if (TOGGLES[action]) {
    await updateCallHubConfig(guild.id, { [TOGGLES[action]]: !cfg[TOGGLES[action]] });
    return interaction.update({ components: await homePanel(guild) });
  }

  switch (action) {
    case "chcfg_ui": {
      const toggle = UI_TOGGLES[arg];
      if (!toggle) return;
      await updateCallHubConfig(guild.id, { [toggle[0]]: !cfg[toggle[1]] });
      return interaction.update({ components: await lookPanel(guild) });
    }

    case "chcfg_mode":
      await updateCallHubConfig(guild.id, { panelMode: cfg.mode === "select" ? null : "select" });
      return interaction.update({ components: await buttonsPanel(guild) });

    case "chcfg_buttons_reset":
      await resetCallHubConfig(guild.id, [
        ...BUTTON_KEYS.flatMap((k) => [`texts.b_${k}`, `texts.d_${k}`, `styles.${k}`]),
        "hiddenButtons",
        "panelMode",
      ]);
      return interaction.update({ components: await buttonsPanel(guild) });

    case "chcfg_home":
      return interaction.update({ components: await homePanel(guild) });

    case "chcfg_page":
      if (arg === "messages") return interaction.update({ components: await messagesPanel(guild) });
      if (arg === "buttons") return interaction.update({ components: await buttonsPanel(guild) });
      return interaction.update({ components: arg === "access" ? await accessPanel(guild) : await lookPanel(guild) });

    case "chcfg_reset_msgs":
      await resetCallHubConfig(guild.id, MESSAGE_KEYS.map((k) => `msgs.${k}`));
      return interaction.update({ components: await messagesPanel(guild) });

    case "chcfg_edit": {
      if (arg === "main") return interaction.showModal(buildMainModal(cfg));
      if (SECTIONS.some((s) => s.id === arg)) return interaction.showModal(buildSectionModal(arg, cfg));
      return;
    }

    case "chcfg_preview":
      return interaction.reply({ components: buildCallPanel(cfg, guild, { disabled: true }), flags: V2 | EPHEMERAL });

    case "chcfg_reset_ui":
      await resetCallHubConfig(guild.id, [
        ...TEXT_KEYS.map((k) => `texts.${k}`),
        ...BUTTON_KEYS.map((k) => `styles.${k}`),
        ...MESSAGE_KEYS.map((k) => `msgs.${k}`),
        "hiddenButtons",
        "panelMode",
        "color",
        "thumbnail",
        "panelLegend",
        "panelDividers",
      ]);
      return interaction.update({ components: await lookPanel(guild) });

    case "chcfg_reset":
      await wipeCallHubConfig(guild.id);
      return interaction.update({ components: await homePanel(guild) });

    default:
      return;
  }
}

async function handleCallHubConfigSelect(interaction) {
  if (!(await guard(interaction))) return;
  const { guild, customId, values } = interaction;

  // Escolheu um botão para editar
  if (customId === "chcfg_btn") {
    const key = values[0];
    if (!BUTTON_KEYS.includes(key)) return;
    return interaction.showModal(buildButtonModal(key, await getCallHubConfig(guild.id)));
  }

  // Escolheu uma mensagem para editar
  if (customId.startsWith("chcfg_msg:")) {
    const key = values[0];
    if (!MESSAGES[key]) return;
    return interaction.showModal(buildMessageModal(key, await getCallHubConfig(guild.id)));
  }

  // Calls ignoradas (o painel não funciona nelas): vazio = nenhuma
  if (customId === "chcfg_ignored") {
    await updateCallHubConfig(guild.id, { ignoredChannels: values });
    return interaction.update({ components: await homePanel(guild) });
  }

  // Listas de cargos (podem ficar vazias)
  const fields = {
    chcfg_allowed: "allowedRoles",
    chcfg_blocked: "blockedRoles",
    chcfg_staff: "staffRoles",
  };
  const field = fields[customId];
  if (!field) return;

  await updateCallHubConfig(guild.id, { [field]: values.filter((id) => id !== guild.id) }); // nunca o @everyone
  return interaction.update({ components: await accessPanel(guild) });
}

function parseColor(raw) {
  const value = raw.toLowerCase();
  if (!value || ["nenhuma", "nenhum", "sem cor", "sem", "none"].includes(value)) return { ok: true, value: null };
  const match = value.match(/^#?([0-9a-f]{6})$/);
  return match ? { ok: true, value: parseInt(match[1], 16) } : { ok: false };
}

function parseThumbnail(raw) {
  const value = raw.toLowerCase();
  if (!value || ["auto", "automatica", "automática", "servidor", "server"].includes(value)) return { ok: true, value: null };
  if (["nenhuma", "nenhum", "none", "sem"].includes(value)) return { ok: true, value: "none" };
  if (/^https?:\/\/\S+$/i.test(raw)) return { ok: true, value: raw };
  return { ok: false };
}

// Texto igual ao padrão (ou vazio) volta a ser "padrão", assim mudanças futuras do padrão valem para o servidor
const textPatch = (key, value) => (value && value !== DEFAULT_TEXTS[key] ? value : null);

async function handleCallHubConfigModal(interaction) {
  if (!(await guard(interaction))) return;
  const { guild } = interaction;
  const cfg = await getCallHubConfig(guild.id);
  const [, kind] = interaction.customId.split(":");

  const read = (id) => {
    try {
      return interaction.fields.getTextInputValue(id).trim();
    } catch {
      return "";
    }
  };

  const patch = {};
  let back = "look";

  if (kind === "main") {
    const color = parseColor(read("color"));
    if (!color.ok) return deny(interaction, "Cor inválida. Use o formato #RRGGBB (ex.: #5865F2) ou deixe vazio.");
    const thumb = parseThumbnail(read("thumbnail"));
    if (!thumb.ok) return deny(interaction, "Miniatura inválida. Use um link http(s), \"nenhuma\" ou deixe vazio.");

    patch.color = color.value;
    patch.thumbnail = thumb.value;
    for (const key of ["title", "desc", "footer"]) {
      patch[`texts.${key}`] = textPatch(key, read(key));
    }
    if (read("footer").toLowerCase() === "nenhum") patch["texts.footer"] = "nenhum";
  } else if (kind.startsWith("btn_")) {
    const key = kind.slice("btn_".length);
    if (!BUTTON_KEYS.includes(key)) return;
    back = "buttons";

    patch[`texts.b_${key}`] = textPatch(`b_${key}`, read("name").slice(0, 80));
    patch[`texts.d_${key}`] = textPatch(`d_${key}`, read("desc").slice(0, 150));

    const pick = (id) => {
      try {
        return interaction.fields.getStringSelectValues(id)?.[0] ?? null;
      } catch {
        return null;
      }
    };
    const style = pick("style");
    if (STYLE_LABELS[style]) patch[`styles.${key}`] = style === DEFAULT_STYLES[key] ? null : style;

    const visible = pick("visible");
    if (visible) {
      const hidden = new Set(cfg.hidden);
      if (visible === "hide") hidden.add(key);
      else hidden.delete(key);
      patch.hiddenButtons = [...hidden];
    }
  } else if (kind.startsWith("msg_")) {
    const key = kind.slice("msg_".length);
    if (!MESSAGES[key]) return;
    back = "messages";
    const value = read("text");
    patch[`msgs.${key}`] = value && value !== DEFAULT_MESSAGES[key] ? value : null;
  } else {
    const section = SECTIONS.find((s) => s.id === kind);
    if (!section) return;

    patch[`texts.${section.titleKey}`] = textPatch(section.titleKey, read("title"));
    patch[`texts.${section.descKey}`] = textPatch(section.descKey, read("desc"));
  }

  await updateCallHubConfig(guild.id, patch);
  const components =
    back === "messages"
      ? await messagesPanel(guild)
      : back === "buttons"
        ? await buttonsPanel(guild)
        : await lookPanel(guild);
  if (interaction.isFromMessage()) return interaction.update({ components });
  return interaction.reply({ components, flags: V2 | EPHEMERAL });
}

// =====================================================================
//  PAINEL DA CALL (botões usados por quem está em uma call)
// =====================================================================

// REGRA: o painel age sobre a call de voz em que a pessoa está AGORA, seja qual for o canal onde o painel foi
// enviado (chat da call, n!painel em qualquer canal). Quem não está em uma call recebe um aviso só para ele.
// Cargos permitidos/bloqueados e calls ignoradas são configurados em n!menu → Gerenciador de calls.
// Todos os textos abaixo vêm de utils/callHubMessages.js e são editáveis em n!menu → Mensagens e respostas.

// Botões de painéis enviados na versão anterior (o "Ver Dono" chamava-se "Informações")
const LEGACY_ACTIONS = { info: "owner" };

// Retorna { channel } ou responde com um aviso e retorna null
async function requireCall(interaction, cfg, { update = false } = {}) {
  const { guild, member } = interaction;
  const send = (content) =>
    update ? interaction.update({ components: buildNotice(content) }) : reply(interaction, content);

  if (!cfg.enabled) {
    await send(say(cfg, "disabled"));
    return null;
  }

  const blocked = cfg.blockedRoles.length > 0 && member.roles.cache.hasAny(...cfg.blockedRoles);
  const notAllowed = cfg.allowedRoles.length > 0 && !member.roles.cache.hasAny(...cfg.allowedRoles);
  if (blocked || notAllowed) {
    await send(say(cfg, "noAccess"));
    return null;
  }

  const channel = member.voice?.channel;
  if (!channel) {
    await send(say(cfg, "noCall"));
    return null;
  }
  if (channel.type !== ChannelType.GuildVoice) {
    await send(say(cfg, "unsupported"));
    return null;
  }
  if (cfg.ignoredChannels.includes(channel.id) || channel.id === guild.afkChannelId) {
    await send(say(cfg, "ignoredCall", { canal: `<#${channel.id}>` }));
    return null;
  }

  return { channel };
}

const PICKER_ACTIONS = { add: 5, remove: 5, kick: 5, move: 5, transfer: 1, blacklist: 5 }; // action -> máx. de pessoas

const mentions = (ids) => ids.map((id) => `<@${id}>`).join(" ");

const accessWord = (cfg, channel) => say(cfg, isLocked(channel) ? "wordPrivate" : "wordPublic");
const limitWord = (cfg, channel) =>
  channel.userLimit ? say(cfg, "limitShort", { n: channel.userLimit }) : say(cfg, "limitNone");

async function handleCallPanelButton(interaction) {
  const cfg = await getCallHubConfig(interaction.guild.id);
  return runPanelAction(interaction, interaction.customId.slice("cpn_".length), cfg);
}

// Menu de seleção do painel (modo "select menu"): cada opção dispara a mesma ação do botão equivalente
async function handlePanelMenu(interaction) {
  const { guild } = interaction;
  const cfg = await getCallHubConfig(guild.id);
  const action = interaction.values[0];
  if (!BUTTON_KEYS.includes(action) && !LEGACY_ACTIONS[action]) return;

  await runPanelAction(interaction, action, cfg);

  // Devolve o menu ao estado inicial (sem a opção escolhida marcada), para dar para escolher a mesma de novo
  const message = interaction.message;
  if (message && !message.flags?.has(MessageFlags.Ephemeral)) {
    message
      .edit({ components: buildCallPanel(cfg, guild), flags: V2, allowedMentions: { parse: [] } })
      .catch(() => {});
  }
}

async function runPanelAction(interaction, rawAction, cfg) {
  const { guild, member } = interaction;
  const action = LEGACY_ACTIONS[rawAction] ?? rawAction;

  // "Privar mantendo todos" vem do seletor efêmero: a mensagem é atualizada em vez de criar outra
  if (action === "lockkeep") {
    const found = await requireCall(interaction, cfg, { update: true });
    if (!found) return;
    const keep = humansIn(found.channel)
      .map((m) => m.id)
      .filter((id) => id !== member.id);
    await applyLock(found.channel, member.id, keep);
    return interaction.update({
      components: buildNotice(keep.length ? say(cfg, "lockDone", { pessoas: mentions(keep) }) : say(cfg, "lockAlone")),
    });
  }

  const found = await requireCall(interaction, cfg);
  if (!found) return;
  const { channel } = found;

  switch (action) {
    case "lock": {
      const current = humansIn(channel)
        .map((m) => m.id)
        .filter((id) => id !== member.id);
      return interaction.reply({
        components: buildPicker({
          action: "lock",
          title: say(cfg, "lockTitle"),
          hint: say(cfg, "lockHint"),
          placeholder: say(cfg, "pickPlaceholder"),
          min: 0,
          max: 25,
          defaults: [...new Set([...allowedMemberIds(channel, member.id), ...current])],
          extraButton: { id: "cpn_lockkeep", label: say(cfg, "lockKeepButton") },
        }),
        flags: V2 | EPHEMERAL,
      });
    }

    case "unlock":
      await setLocked(channel, false);
      return reply(interaction, say(cfg, "unlockDone"));

    case "limit":
      return interaction.showModal(
        buildLimitModal(channel.userLimit, {
          title: say(cfg, "limitModalTitle"),
          label: say(cfg, "limitModalLabel"),
          desc: say(cfg, "limitModalDesc"),
          placeholder: say(cfg, "limitModalPlaceholder"),
        })
      );

    case "owner":
      // Sem transferência, quem está na call é o dono dela (mostra a menção de quem clicou)
      return reply(
        interaction,
        say(cfg, "ownerInfo", {
          dono: `<@${getOwner(channel) ?? member.id}>`,
          canal: `<#${channel.id}>`,
          acesso: accessWord(cfg, channel),
          limite: channel.userLimit ? say(cfg, "limitValue", { n: channel.userLimit }) : say(cfg, "limitNone"),
          pessoas: humansIn(channel).size,
        })
      );

    case "add":
    case "remove":
    case "kick":
    case "move":
    case "blacklist":
      return interaction.reply({
        components: buildPicker({
          action,
          title: say(cfg, `${action}Title`),
          hint: say(cfg, `${action}Hint`),
          placeholder: say(cfg, "pickPlaceholder"),
          min: 1,
          max: PICKER_ACTIONS[action],
        }),
        flags: V2 | EPHEMERAL,
      });

    case "transfer": {
      const owner = getOwner(channel);
      if (owner && owner !== member.id) return reply(interaction, say(cfg, "transferNotOwner", { dono: `<@${owner}>` }));

      const others = humansIn(channel).filter((m) => m.id !== member.id);
      if (others.size === 0) return reply(interaction, say(cfg, "transferAlone"));

      return interaction.reply({
        components: buildMemberPicker({
          action: "transfer",
          title: say(cfg, "transferTitle"),
          hint: say(cfg, "transferHint"),
          placeholder: say(cfg, "pickPlaceholder"),
          members: others.map((m) => ({ id: m.id, name: m.displayName, username: m.user.username })),
        }),
        flags: V2 | EPHEMERAL,
      });
    }

    case "save": {
      const allowed = allowedMemberIds(channel, member.id);
      await updateProfile(guild.id, member.id, {
        hasSaved: true,
        limit: channel.userLimit,
        locked: isLocked(channel),
        allowed: allowed.slice(0, 25),
      });
      return reply(
        interaction,
        say(cfg, "saveDone", {
          acesso: accessWord(cfg, channel),
          limite: limitWord(cfg, channel),
          extra: allowed.length ? say(cfg, "saveExtra", { n: allowed.length }) : "",
        })
      );
    }

    case "load": {
      const profile = await getProfile(guild.id, member.id);
      if (!profile?.hasSaved) return reply(interaction, say(cfg, "loadNone"));

      await interaction.deferReply({ flags: EPHEMERAL });
      const blocked = blockedMemberIds(channel);
      const saved = (profile.allowed ?? []).filter((id) => !blocked.includes(id));

      await channel.setUserLimit(profile.limit ?? 0).catch(() => {});
      if (profile.locked) {
        await applyLock(channel, member.id, [...new Set([...allowedMemberIds(channel, member.id), ...saved])]);
      } else {
        await setLocked(channel, false);
        for (const id of saved) await allowUser(channel, id).catch(() => {});
      }
      return interaction.editReply({
        flags: V2,
        components: buildNotice(
          say(cfg, "loadDone", {
            acesso: say(cfg, profile.locked ? "wordPrivate" : "wordPublic"),
            limite: profile.limit ? say(cfg, "limitShort", { n: profile.limit }) : say(cfg, "limitNone"),
          })
        ),
      });
    }

    default:
      return;
  }
}

// Resultado de cada seletor de pessoas
async function runPick(action, ids, { guild, channel, actor, cfg }) {
  const done = [];
  const skipped = [];
  const targets = [...new Set(ids)];
  const why = (id, key) => `<@${id}> ${say(cfg, key)}`;
  const join = (...lines) => lines.filter(Boolean).join("\n");

  const blocked = blockedMemberIds(channel);
  const actorIsAdmin = actor.permissions.has(PermissionFlagsBits.Administrator);

  const fetchMember = (id) => guild.members.cache.get(id) ?? guild.members.fetch(id).catch(() => null);
  // Administradores não podem ser desconectados nem bloqueados por quem não é administrador
  const isProtected = (member) => !actorIsAdmin && member.permissions.has(PermissionFlagsBits.Administrator);

  switch (action) {
    case "lock": {
      const allowed = targets.filter((id) => !blocked.includes(id));
      await applyLock(channel, actor.id, allowed);
      return allowed.length ? say(cfg, "lockDone", { pessoas: mentions(allowed) }) : say(cfg, "lockAlone");
    }

    case "add":
      for (const id of targets) {
        const member = await fetchMember(id);
        if (!member || member.user.bot) skipped.push(why(id, "reasonInvalid"));
        else if (id === actor.id) skipped.push(why(id, "reasonSelf"));
        else if (blocked.includes(id)) skipped.push(why(id, "reasonBlacklist"));
        else if (await allowUser(channel, id)) done.push(`<@${id}>`);
        else skipped.push(`<@${id}>`);
      }
      return join(
        done.length ? say(cfg, "addDone", { pessoas: done.join(" ") }) : null,
        skipped.length ? say(cfg, "addFail", { pessoas: skipped.join(", ") }) : null
      );

    case "remove":
      for (const id of targets) {
        if (id === actor.id) skipped.push(why(id, "reasonSelf"));
        else if (await clearUser(channel, id)) done.push(`<@${id}>`);
        else skipped.push(why(id, "reasonNoPermission"));
      }
      return join(
        done.length ? say(cfg, "removeDone", { pessoas: done.join(" ") }) : null,
        skipped.length ? say(cfg, "removeFail", { pessoas: skipped.join(", ") }) : null
      );

    case "kick":
      for (const id of targets) {
        const member = await fetchMember(id);
        if (id === actor.id) skipped.push(why(id, "reasonSelf"));
        else if (!member || member.voice.channelId !== channel.id) skipped.push(why(id, "reasonNotInCall"));
        else if (isProtected(member)) skipped.push(why(id, "reasonProtected"));
        else if (await member.voice.disconnect(say(cfg, "kickAudit")).then(() => true).catch(() => false)) done.push(`<@${id}>`);
        else skipped.push(`<@${id}>`);
      }
      return join(
        done.length ? say(cfg, "kickDone", { pessoas: done.join(" ") }) : null,
        skipped.length ? say(cfg, "kickFail", { pessoas: skipped.join(", ") }) : null
      );

    case "move": {
      const locked = isLocked(channel);
      for (const id of targets) {
        const member = await fetchMember(id);
        if (!member || member.user.bot) skipped.push(why(id, "reasonInvalid"));
        else if (blocked.includes(id)) skipped.push(why(id, "reasonBlacklist"));
        else if (!member.voice.channelId) skipped.push(why(id, "reasonNoVoice"));
        else if (member.voice.channelId === channel.id) skipped.push(why(id, "reasonAlreadyIn"));
        else {
          // Call privada: libera a entrada para a pessoa não ficar presa do lado de fora depois
          if (locked) await allowUser(channel, id).catch(() => {});
          if (await member.voice.setChannel(channel).then(() => true).catch(() => false)) done.push(`<@${id}>`);
          else skipped.push(`<@${id}>`);
        }
      }
      return join(
        done.length ? say(cfg, "moveDone", { pessoas: done.join(" ") }) : null,
        skipped.length ? say(cfg, "moveFail", { pessoas: skipped.join(", ") }) : null
      );
    }

    case "transfer": {
      const owner = getOwner(channel);
      if (owner && owner !== actor.id) return say(cfg, "transferNotOwner", { dono: `<@${owner}>` });

      const id = targets[0];
      const member = await fetchMember(id);
      if (!member || member.user.bot) return say(cfg, "transferInvalid");
      if (id === actor.id) return say(cfg, "transferSelf");
      if (member.voice.channelId !== channel.id) return say(cfg, "transferNotIn");
      if (blocked.includes(id)) return why(id, "reasonBlacklist");

      await setOwner(channel, id);
      if (isLocked(channel)) await allowUser(channel, id); // continua entrando mesmo se a call for privada
      return say(cfg, "transferDone", { pessoa: `<@${id}>` });
    }

    case "blacklist": {
      // A blacklist vale só para esta call: bloqueia a entrada da pessoa; escolher alguém já bloqueado libera
      const added = [];
      const removed = [];
      let count = blocked.length;
      for (const id of targets) {
        if (blocked.includes(id)) {
          await unblockUser(channel, id);
          removed.push(`<@${id}>`);
          count -= 1;
          continue;
        }
        if (id === actor.id) {
          skipped.push(why(id, "reasonSelfBlock"));
          continue;
        }
        const member = await fetchMember(id);
        if (!member || member.user.bot) {
          skipped.push(why(id, "reasonInvalid"));
        } else if (isProtected(member)) {
          skipped.push(why(id, "reasonProtected"));
        } else if (count >= 50) {
          skipped.push(why(id, "reasonListFull"));
        } else {
          await denyUser(channel, id);
          if (member.voice.channelId === channel.id) await member.voice.disconnect(say(cfg, "blAudit")).catch(() => {});
          count += 1;
          added.push(`<@${id}>`);
        }
      }
      return join(
        added.length ? say(cfg, "blAdded", { pessoas: added.join(" ") }) : null,
        removed.length ? say(cfg, "blRemoved", { pessoas: removed.join(" ") }) : null,
        skipped.length ? say(cfg, "blSkipped", { pessoas: skipped.join(", ") }) : null
      );
    }

    default:
      return null;
  }
}

async function handleCallPanelSelect(interaction) {
  if (interaction.customId.startsWith("cpn_menu:")) return handlePanelMenu(interaction);

  const { guild } = interaction;
  const [, action] = interaction.customId.split(":");
  if (!PICKER_ACTIONS[action] && action !== "lock") return;

  const cfg = await getCallHubConfig(guild.id);
  const found = await requireCall(interaction, cfg, { update: true });
  if (!found) return;

  await interaction.deferUpdate();
  const result = await runPick(action, interaction.values, {
    guild,
    channel: found.channel,
    actor: interaction.member,
    cfg,
  }).catch((err) => {
    console.error(`[CALLS] Erro na ação "${action}":`, err);
    return say(cfg, "errorGeneric");
  });

  return interaction.editReply({ components: buildNotice(result || say(cfg, "nothingChanged")) });
}

async function handleCallPanelModal(interaction) {
  const { guild } = interaction;
  const [, kind] = interaction.customId.split(":");
  if (kind !== "limit") return;

  const cfg = await getCallHubConfig(guild.id);
  const found = await requireCall(interaction, cfg);
  if (!found) return;

  const raw = interaction.fields.getTextInputValue("limit").trim();
  if (!/^\d{1,2}$/.test(raw)) return reply(interaction, say(cfg, "limitInvalid"));

  const limit = Number(raw);
  await found.channel.setUserLimit(limit).catch(() => {});
  return reply(interaction, limit ? say(cfg, "limitSet", { n: limit }) : say(cfg, "limitRemoved"));
}

module.exports = {
  openCallHubPanel,
  handleCallHubConfigButton,
  handleCallHubConfigSelect,
  handleCallHubConfigModal,
  handleCallPanelButton,
  handleCallPanelSelect,
  handleCallPanelModal,
};
