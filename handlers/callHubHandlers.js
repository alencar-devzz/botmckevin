const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");
const { getPrefix } = require("../utils/getPrefix");
const { DEFAULT_TEXTS, SECTIONS, TEXT_KEYS } = require("../utils/callHubDefaults");
const {
  getCallHubConfig,
  updateCallHubConfig,
  resetCallHubConfig,
  wipeCallHubConfig,
} = require("../utils/callHubStore");
const {
  getRoom,
  getRoomByOwner,
  forgetRoom,
  humansIn,
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
  transferOwnership,
} = require("../utils/callHub");
const {
  buildCallHubHome,
  buildCallHubAccess,
  buildCallHubLook,
  buildValuesModal,
  buildMainModal,
  buildSectionModal,
} = require("../ui/callHubConfig");
const { buildCallPanel, buildNotice, buildPicker, buildLimitModal } = require("../ui/callPanel");

const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL = MessageFlags.Ephemeral;

const reply = (interaction, content) =>
  interaction.reply({ components: buildNotice(content), flags: V2 | EPHEMERAL });

// =====================================================================
//  CONFIGURAÇÃO (n!menu → Comunidade e interação → Calls temporárias)
// =====================================================================

// Quem configura: Administrador ou cargos da equipe
async function guard(interaction) {
  const member = interaction.member;
  const allowed =
    member?.permissions?.has(PermissionFlagsBits.Administrator) ||
    member?.roles?.cache?.hasAny(...ALL_STAFF_ROLE_IDS);
  if (allowed) return true;

  await interaction.reply({
    content: "Você não tem permissão para configurar as calls temporárias.",
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
const lookPanel = async (guild) =>
  buildCallHubLook(guild, await getCallHubConfig(guild.id), await getPrefix(guild.id));

async function openCallHubPanel(interaction) {
  if (!(await guard(interaction))) return;
  return interaction.update({ components: await homePanel(interaction.guild) });
}

// Botões que apenas alternam um campo
const TOGGLES = {
  chcfg_toggle: "enabled",
  chcfg_sendpanel: "sendPanel",
  chcfg_private: "defaultPrivate",
  chcfg_transfer: "autoTransfer",
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
    case "chcfg_home":
      return interaction.update({ components: await homePanel(guild) });

    case "chcfg_page":
      return interaction.update({ components: arg === "access" ? await accessPanel(guild) : await lookPanel(guild) });

    case "chcfg_edit": {
      if (arg === "values") return interaction.showModal(buildValuesModal(cfg));
      if (arg === "main") return interaction.showModal(buildMainModal(cfg));
      if (SECTIONS.some((s) => s.id === arg)) return interaction.showModal(buildSectionModal(arg, cfg));
      return;
    }

    case "chcfg_preview":
      return interaction.reply({ components: buildCallPanel(cfg, guild), flags: V2 | EPHEMERAL });

    case "chcfg_reset_ui":
      await resetCallHubConfig(guild.id, [...TEXT_KEYS.map((k) => `texts.${k}`), "color", "thumbnail"]);
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

  // Canais (gatilho e categoria): vazio = limpa
  if (customId === "chcfg_trigger" || customId === "chcfg_category") {
    const field = customId === "chcfg_trigger" ? "triggerChannelId" : "categoryId";
    await updateCallHubConfig(guild.id, { [field]: values[0] ?? null });
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

// "" mantém o valor atual; texto inválido cancela com aviso
function readNumber(interaction, id, current, min, max, label) {
  let raw = "";
  try {
    raw = interaction.fields.getTextInputValue(id).trim();
  } catch {
    return { value: current };
  }
  if (!raw) return { value: current };
  if (!/^\d+$/.test(raw)) return { error: `${label}: use apenas números inteiros.` };
  const n = Number(raw);
  if (n < min || n > max) return { error: `${label}: use um valor entre ${min} e ${max}.` };
  return { value: n };
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

  if (kind === "values") {
    back = "home";
    const template = read("nameTemplate");
    patch.nameTemplate = template && template !== "{nametag}" ? template : null;

    for (const [id, key, min, max, label] of [
      ["defaultLimit", "defaultLimit", 0, 99, "Limite de pessoas"],
      ["deleteDelay", "deleteDelay", 0, 300, "Tempo para apagar"],
      ["cooldown", "cooldown", 0, 3600, "Espera entre criações"],
    ]) {
      const result = readNumber(interaction, id, cfg[key], min, max, label);
      if (result.error) return deny(interaction, result.error);
      patch[key] = result.value;
    }
  } else if (kind === "main") {
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
  } else {
    const section = SECTIONS.find((s) => s.id === kind);
    if (!section) return;

    patch[`texts.${section.titleKey}`] = textPatch(section.titleKey, read("title"));

    const lines = read("lines")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    section.keys.forEach((key, index) => {
      const line = lines[index];
      if (!line) {
        patch[`texts.b_${key}`] = null;
        patch[`texts.d_${key}`] = null;
        return;
      }
      const sep = line.indexOf("|");
      const label = (sep === -1 ? line : line.slice(0, sep)).trim().slice(0, 80);
      const desc = (sep === -1 ? "" : line.slice(sep + 1)).trim().slice(0, 150);
      patch[`texts.b_${key}`] = textPatch(`b_${key}`, label);
      patch[`texts.d_${key}`] = textPatch(`d_${key}`, desc);
    });
  }

  await updateCallHubConfig(guild.id, patch);
  const components = back === "home" ? await homePanel(guild) : await lookPanel(guild);
  if (interaction.isFromMessage()) return interaction.update({ components });
  return interaction.reply({ components, flags: V2 | EPHEMERAL });
}

// =====================================================================
//  PAINEL DA CALL (botões usados pelo dono da call)
// =====================================================================

const isStaff = (cfg, member) =>
  member.permissions.has(PermissionFlagsBits.Administrator) ||
  (cfg.staffRoles.length > 0 && member.roles.cache.hasAny(...cfg.staffRoles));

// Descobre qual call a pessoa está controlando: a dela, ou (equipe) a call em que está
function findRoom(guild, member, cfg) {
  const own = getRoomByOwner(guild.id, member.id);
  if (own) return own;
  const current = member.voice?.channelId ? getRoom(member.voice.channelId) : null;
  if (current && isStaff(cfg, member)) return current;
  return null;
}

// Retorna { room, channel } ou responde com um aviso e retorna null
async function requireRoom(interaction, cfg, { update = false } = {}) {
  const { guild, member } = interaction;
  const room = findRoom(guild, member, cfg);
  const send = (content) =>
    update
      ? interaction.update({ components: buildNotice(content) })
      : reply(interaction, content);

  if (!room) {
    const where =
      cfg.triggerChannelId && guild.channels.cache.has(cfg.triggerChannelId)
        ? ` Entre em <#${cfg.triggerChannelId}> para criar a sua.`
        : "";
    await send(`Você não é dono de nenhuma call no momento.${where}`);
    return null;
  }

  const channel = guild.channels.cache.get(room.channelId);
  if (!channel) {
    await forgetRoom(room.channelId);
    await send("Essa call não existe mais.");
    return null;
  }
  return { room, channel };
}

const PICKERS = {
  add: { title: "Adicionar", hint: "Selecione quem pode entrar na sua call.", max: 5 },
  remove: { title: "Remover", hint: "Selecione de quem você quer tirar a permissão de entrada.", max: 5 },
  kick: { title: "Desconectar", hint: "Selecione quem você quer expulsar da call agora.", max: 5 },
  move: {
    title: "Mover",
    hint: "Selecione quem você quer puxar para a sua call. A pessoa precisa estar em algum canal de voz.",
    max: 5,
  },
  transfer: {
    title: "Transferir",
    hint: "Selecione quem vai assumir o controle da call. A pessoa precisa estar nela.",
    max: 1,
  },
  blacklist: {
    title: "Blacklist",
    hint: "Selecione quem você quer bloquear de todas as suas calls. Quem já está bloqueado é liberado.",
    max: 5,
  },
};

const mentions = (ids) => ids.map((id) => `<@${id}>`).join(" ");

async function handleCallPanelButton(interaction) {
  const { guild } = interaction;
  const action = interaction.customId.slice("cpn_".length);
  const cfg = await getCallHubConfig(guild.id);

  // "Privar mantendo todos" vem do seletor efêmero: a mensagem é atualizada em vez de criar outra
  if (action === "lockkeep") {
    const found = await requireRoom(interaction, cfg, { update: true });
    if (!found) return;
    const keep = humansIn(found.channel)
      .map((m) => m.id)
      .filter((id) => id !== found.room.ownerId);
    await applyLock(found.channel, found.room, keep);
    return interaction.update({
      components: buildNotice(
        keep.length
          ? `Call privada. Continuam podendo entrar: ${mentions(keep)}`
          : "Call privada. Só você consegue entrar."
      ),
    });
  }

  const found = await requireRoom(interaction, cfg);
  if (!found) return;
  const { room, channel } = found;

  switch (action) {
    case "lock": {
      const current = humansIn(channel)
        .map((m) => m.id)
        .filter((id) => id !== room.ownerId);
      return interaction.reply({
        components: buildPicker({
          action: "lock",
          title: "Privar",
          hint: "Escolha quem pode continuar entrando. Quem já está na call não é expulso.",
          min: 0,
          max: 25,
          defaults: [...new Set([...allowedMemberIds(channel, room.ownerId), ...current])],
          extraButton: { id: "cpn_lockkeep", label: "Manter só quem está na call" },
        }),
        flags: V2 | EPHEMERAL,
      });
    }

    case "unlock":
      await setLocked(channel, false);
      return reply(interaction, "Call pública de novo. Qualquer pessoa pode entrar (menos quem está na blacklist).");

    case "limit":
      return interaction.showModal(buildLimitModal(channel.userLimit));

    case "owner": {
      const humans = humansIn(channel).size;
      return reply(
        interaction,
        [
          `**Dono da call:** <@${room.ownerId}>`,
          `**Acesso:** ${isLocked(channel) ? "privada" : "pública"} · **Limite:** ${
            channel.userLimit ? `${channel.userLimit} pessoas` : "sem limite"
          } · **Na call agora:** ${humans}`,
        ].join("\n")
      );
    }

    case "add":
    case "remove":
    case "kick":
    case "move":
    case "transfer":
    case "blacklist":
      return interaction.reply({
        components: buildPicker({ action, ...PICKERS[action], min: 1 }),
        flags: V2 | EPHEMERAL,
      });

    case "save": {
      const profile = await getProfile(guild.id, room.ownerId);
      const allowed = allowedMemberIds(channel, room.ownerId).filter((id) => !(profile?.blacklist ?? []).includes(id));
      await updateProfile(guild.id, room.ownerId, {
        hasSaved: true,
        limit: channel.userLimit,
        locked: isLocked(channel),
        allowed: allowed.slice(0, 25),
      });
      return reply(
        interaction,
        `Configuração salva: ${isLocked(channel) ? "privada" : "pública"}, ${
          channel.userLimit ? `limite de ${channel.userLimit}` : "sem limite"
        }${allowed.length ? `, ${allowed.length} pessoa(s) com acesso liberado` : ""}.`
      );
    }

    case "load": {
      const profile = await getProfile(guild.id, room.ownerId);
      if (!profile?.hasSaved) return reply(interaction, "Você ainda não salvou nenhuma configuração. Use o botão de salvar primeiro.");

      await interaction.deferReply({ flags: EPHEMERAL });
      await channel.setUserLimit(profile.limit ?? 0).catch(() => {});
      if (profile.locked) {
        const keep = [...new Set([...allowedMemberIds(channel, room.ownerId), ...profile.allowed])];
        await applyLock(channel, room, keep);
      } else {
        await setLocked(channel, false);
        for (const id of profile.allowed) {
          if (!(profile.blacklist ?? []).includes(id)) await allowUser(channel, id);
        }
      }
      return interaction.editReply({
        flags: V2,
        components: buildNotice(
          `Configuração aplicada: ${profile.locked ? "privada" : "pública"}, ${
            profile.limit ? `limite de ${profile.limit}` : "sem limite"
          }.`
        ),
      });
    }

    default:
      return;
  }
}

// Resultado de cada seletor de pessoas
async function runPick(action, ids, { guild, channel, room, actor }) {
  const owner = room.ownerId;
  const done = [];
  const skipped = [];
  const targets = [...new Set(ids)];

  const profile = await getProfile(guild.id, owner);
  const blacklist = profile?.blacklist ?? [];

  const fetchMember = (id) => guild.members.cache.get(id) ?? guild.members.fetch(id).catch(() => null);

  switch (action) {
    case "lock": {
      await applyLock(channel, room, targets.filter((id) => !blacklist.includes(id)));
      return targets.length
        ? `Call privada. Continuam podendo entrar: ${mentions(targets)}`
        : "Call privada. Só você consegue entrar.";
    }

    case "add":
      for (const id of targets) {
        const member = await fetchMember(id);
        if (!member || member.user.bot) skipped.push(`<@${id}> (não é um membro válido)`);
        else if (id === owner) skipped.push(`<@${id}> (é o dono)`);
        else if (blacklist.includes(id)) skipped.push(`<@${id}> (está na blacklist)`);
        else if (await allowUser(channel, id)) done.push(`<@${id}>`);
        else skipped.push(`<@${id}>`);
      }
      return [
        done.length ? `Liberei a entrada de: ${done.join(" ")}` : null,
        skipped.length ? `Não consegui liberar: ${skipped.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join("\n");

    case "remove":
      for (const id of targets) {
        if (id === owner) skipped.push(`<@${id}> (é o dono)`);
        else if (await clearUser(channel, id)) done.push(`<@${id}>`);
        else skipped.push(`<@${id}> (não tinha permissão liberada)`);
      }
      return [
        done.length ? `Tirei a permissão de entrada de: ${done.join(" ")}` : null,
        skipped.length ? `Sem alteração: ${skipped.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join("\n");

    case "kick":
      for (const id of targets) {
        const member = await fetchMember(id);
        if (id === owner) skipped.push(`<@${id}> (é o dono)`);
        else if (!member || member.voice.channelId !== channel.id) skipped.push(`<@${id}> (não está na call)`);
        else if (await member.voice.disconnect("Desconectado pelo dono da call").then(() => true).catch(() => false)) done.push(`<@${id}>`);
        else skipped.push(`<@${id}>`);
      }
      return [
        done.length ? `Desconectei: ${done.join(" ")}` : null,
        skipped.length ? `Não consegui desconectar: ${skipped.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join("\n");

    case "move": {
      const locked = isLocked(channel);
      for (const id of targets) {
        const member = await fetchMember(id);
        if (!member || member.user.bot) skipped.push(`<@${id}> (não é um membro válido)`);
        else if (blacklist.includes(id)) skipped.push(`<@${id}> (está na blacklist)`);
        else if (!member.voice.channelId) skipped.push(`<@${id}> (não está em nenhum canal de voz)`);
        else if (member.voice.channelId === channel.id) skipped.push(`<@${id}> (já está na call)`);
        else {
          // Call privada: libera a entrada para a pessoa não ficar presa do lado de fora depois
          if (locked) await allowUser(channel, id).catch(() => {});
          if (await member.voice.setChannel(channel).then(() => true).catch(() => false)) done.push(`<@${id}>`);
          else skipped.push(`<@${id}>`);
        }
      }
      return [
        done.length ? `Movi para a sua call: ${done.join(" ")}` : null,
        skipped.length ? `Não consegui mover: ${skipped.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    }

    case "transfer": {
      const id = targets[0];
      const member = await fetchMember(id);
      if (!member || member.user.bot) return "Escolha uma pessoa (bots não podem ser donos).";
      if (id === owner) return "Essa pessoa já é a dona da call.";
      if (member.voice.channelId !== channel.id) return "A pessoa precisa estar dentro da call para assumir o controle.";
      if (getRoomByOwner(guild.id, id)) return "Essa pessoa já é dona de outra call.";
      await transferOwnership(channel, id);
      return `Agora <@${id}> está no controle da call.`;
    }

    case "blacklist": {
      let list = [...blacklist];
      const added = [];
      const removed = [];
      for (const id of targets) {
        if (id === owner || id === actor.id) {
          skipped.push(`<@${id}> (não dá para bloquear você mesmo)`);
        } else if (list.includes(id)) {
          list = list.filter((x) => x !== id);
          await unblockUser(channel, id);
          removed.push(`<@${id}>`);
        } else {
          const member = await fetchMember(id);
          if (!member || member.user.bot) {
            skipped.push(`<@${id}> (não é um membro válido)`);
            continue;
          }
          if (list.length >= 50) {
            skipped.push(`<@${id}> (limite de 50 na blacklist)`);
            continue;
          }
          list.push(id);
          await denyUser(channel, id);
          if (member.voice.channelId === channel.id) await member.voice.disconnect("Blacklist da call").catch(() => {});
          added.push(`<@${id}>`);
        }
      }
      await updateProfile(guild.id, owner, { blacklist: list });
      return [
        added.length ? `Bloqueei: ${added.join(" ")}` : null,
        removed.length ? `Liberei da blacklist: ${removed.join(" ")}` : null,
        skipped.length ? `Sem alteração: ${skipped.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    }

    default:
      return null;
  }
}

async function handleCallPanelSelect(interaction) {
  const { guild } = interaction;
  const [, action] = interaction.customId.split(":");
  if (!PICKERS[action] && action !== "lock") return;

  const cfg = await getCallHubConfig(guild.id);
  const found = await requireRoom(interaction, cfg, { update: true });
  if (!found) return;

  await interaction.deferUpdate();
  const result = await runPick(action, interaction.values, {
    guild,
    channel: found.channel,
    room: found.room,
    actor: interaction.member,
  }).catch((err) => {
    console.error(`[CALLS] Erro na ação "${action}":`, err);
    return "Não consegui concluir. Confira se eu tenho as permissões Gerenciar Canais, Gerenciar Cargos e Mover Membros.";
  });

  return interaction.editReply({ components: buildNotice(result || "Nada foi alterado.") });
}

async function handleCallPanelModal(interaction) {
  const { guild } = interaction;
  const [, kind] = interaction.customId.split(":");
  if (kind !== "limit") return;

  const cfg = await getCallHubConfig(guild.id);
  const found = await requireRoom(interaction, cfg);
  if (!found) return;

  const raw = interaction.fields.getTextInputValue("limit").trim();
  if (!/^\d{1,2}$/.test(raw)) return reply(interaction, "Use apenas números, de 0 a 99.");

  const limit = Number(raw);
  await found.channel.setUserLimit(limit).catch(() => {});
  return reply(interaction, limit ? `Limite definido: **${limit}** pessoas.` : "Limite removido. A call não tem máximo de pessoas.");
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
