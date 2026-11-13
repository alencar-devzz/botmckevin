const { PermissionFlagsBits, PermissionsBitField, GuildVerificationLevel, ChannelType } = require("discord.js");
const { getAntiRaidConfig, updateAntiRaidConfig } = require("./store");
const { sendModuleAlert } = require("./alert");
const { PANIC_LOCK_PERMS } = require("./defaults");

// Botão de pânico: aplica de uma vez as defesas escolhidas no painel e desfaz tudo no segundo clique.
// O estado fica em cfg.panic.active (sobrevive a reinício) e o fim automático é retomado no clientReady.

const LEVEL = { high: GuildVerificationLevel.High, veryHigh: GuildVerificationLevel.VeryHigh };
const LEVEL_NAME = {
  [GuildVerificationLevel.None]: "nenhuma",
  [GuildVerificationLevel.Low]: "baixa",
  [GuildVerificationLevel.Medium]: "média",
  [GuildVerificationLevel.High]: "alta",
  [GuildVerificationLevel.VeryHigh]: "muito alta",
};
const INCIDENT_MAX_MS = 24 * 60 * 60 * 1000 - 60_000; // o Discord só aceita pausas de até 24h

const timers = new Map(); // guildId -> timeout do fim automático
const busy = new Set(); // guildId com ativação/desativação em andamento (evita clique duplo)

const reasonFor = (user, verb) => `Anti-Raid: pânico ${verb}${user ? ` por ${user.tag ?? user.username}` : ""}`;
const lockMask = () => PANIC_LOCK_PERMS.reduce((bits, name) => bits | PermissionFlagsBits[name], 0n);

function explain(err) {
  if (err?.code === 50013 || err?.code === 50001) return "faltou permissão ao bot";
  return String(err?.rawError?.message ?? err?.message ?? "erro desconhecido").slice(0, 140);
}

// Permissões que o bot precisa para as ações escolhidas (texto para mostrar no painel)
function missingPerms(guild, actions) {
  const me = guild.members.me;
  const need = new Set();
  if (actions.some((a) => ["invites", "dms", "verification"].includes(a))) need.add(["Gerenciar servidor", PermissionFlagsBits.ManageGuild]);
  if (actions.includes("lock")) need.add(["Gerenciar cargos", PermissionFlagsBits.ManageRoles]);
  return [...need].filter(([, bit]) => !me?.permissions.has(bit)).map(([label]) => label);
}

// ---- Trava do chat ----
// Só mexer no cargo @everyone não basta: canais com permissão própria para @everyone (o verde de
// "Enviar mensagens") ignoram o cargo. Por isso o pânico também nega o envio no @everyone de cada canal
// e guarda como estava, para devolver igual depois.
const LOCK_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
  ChannelType.GuildVoice,
  ChannelType.GuildStageVoice,
];

// Opções do permissionOverwrites.edit só para as permissões do pânico (true = permite, false = nega, null = neutro)
function editFrom(allow, deny) {
  const out = {};
  for (const name of PANIC_LOCK_PERMS) {
    const bit = PermissionFlagsBits[name];
    out[name] = allow & bit ? true : deny & bit ? false : null;
  }
  return out;
}

async function inBatches(list, size, fn) {
  for (let i = 0; i < list.length; i += size) await Promise.all(list.slice(i, i + size).map(fn));
}

const overwriteBits = (channel, id) => {
  const cur = channel.permissionOverwrites?.cache.get(id);
  return { cur, allow: cur ? BigInt(cur.allow.bitfield) : 0n, deny: cur ? BigInt(cur.deny.bitfield) : 0n };
};

// Nega o envio para @everyone em cada canal. Devolve { saved, done, failed }
async function lockChannels(guild, why) {
  const mask = lockMask();
  const everyoneId = guild.roles.everyone.id;
  const saved = {}; // canal -> [allow, deny] de antes (só as permissões do pânico) ou null se não havia regra
  let done = 0;
  let failed = 0;
  const targets = [...guild.channels.cache.values()].filter((c) => LOCK_TYPES.includes(c.type) && c.permissionOverwrites);

  await inBatches(targets, 5, async (channel) => {
    const { cur, allow, deny } = overwriteBits(channel, everyoneId);
    if ((deny & mask) === mask) return; // já estava negado
    try {
      await channel.permissionOverwrites.edit(guild.roles.everyone, editFrom(0n, mask), { reason: why });
      saved[channel.id] = cur ? [(allow & mask).toString(), (deny & mask).toString()] : null;
      done++;
    } catch {
      failed++;
    }
  });
  return { saved, done, failed };
}

// Devolve cada canal ao que era. Se não havia regra de @everyone e ela ficou vazia, apaga a regra.
async function unlockChannels(guild, saved, why) {
  const mask = lockMask();
  const everyoneId = guild.roles.everyone.id;
  let done = 0;
  let failed = 0;

  await inBatches(Object.entries(saved), 5, async ([id, prev]) => {
    const channel = guild.channels.cache.get(id);
    if (!channel) return; // canal apagado durante o pânico
    const { cur, allow, deny } = overwriteBits(channel, everyoneId);
    const prevAllow = prev ? BigInt(prev[0]) : 0n;
    const prevDeny = prev ? BigInt(prev[1]) : 0n;
    try {
      if (((allow & ~mask) | prevAllow) === 0n && ((deny & ~mask) | prevDeny) === 0n) {
        if (cur) await cur.delete(why);
      } else {
        await channel.permissionOverwrites.edit(guild.roles.everyone, editFrom(prevAllow, prevDeny), { reason: why });
      }
      done++;
    } catch {
      failed++;
    }
  });
  return { done, failed };
}

// ---- Pausa de convites e DMs (ações de incidente do Discord) ----
// Mantém o que já estava pausado por outro motivo: só mexe nos campos que o pânico pediu.
async function setIncident(guild, { invitesUntil, dmsUntil }) {
  const cur = guild.incidentsData ?? {};
  const data = {
    invitesDisabledUntil: invitesUntil === undefined ? cur.invitesDisabledUntil ?? null : invitesUntil && new Date(invitesUntil),
    dmsDisabledUntil: dmsUntil === undefined ? cur.dmsDisabledUntil ?? null : dmsUntil && new Date(dmsUntil),
  };
  if (typeof guild.setIncidentActions === "function") return guild.setIncidentActions(data);
  throw new Error("esta versão do discord.js não tem as ações de incidente (atualize o discord.js)");
}

// ======================= Ativar =======================

async function activatePanic(guild, user) {
  if (busy.has(guild.id)) return { title: "Pânico", lines: ["Já tem uma ativação ou desativação em andamento. Espere alguns segundos."] };
  busy.add(guild.id);
  try {
    const cfg = await getAntiRaidConfig(guild.id);
    const p = cfg.panic;
    if (p.active) return { title: "O pânico já estava ativo", lines: [] };
    if (!p.actions.length) return { title: "Pânico", lines: ["Nenhuma ação escolhida. Abra **Ajustar pânico** e marque pelo menos uma."] };

    const now = Date.now();
    const until = now + p.durationMin * 60_000;
    const why = reasonFor(user, "ativado");
    const state = { since: now, until, by: user.id, invites: false, dms: false, verification: null, lock: null };
    const lines = []; // [texto, deu certo]
    const note = (ok, text) => lines.push(`${ok ? "feito" : "falhou"}  ${text}`);

    const missing = missingPerms(guild, p.actions);
    if (missing.length) lines.push(`aviso  faltam permissões do bot: ${missing.join(", ")}`);

    // Convites e DMs numa chamada só
    const wantInvites = p.actions.includes("invites");
    const wantDms = p.actions.includes("dms");
    if (wantInvites || wantDms) {
      const incidentUntil = Math.min(until, now + INCIDENT_MAX_MS);
      try {
        await setIncident(guild, { invitesUntil: wantInvites ? incidentUntil : undefined, dmsUntil: wantDms ? incidentUntil : undefined });
        state.invites = wantInvites;
        state.dms = wantDms;
        if (wantInvites) note(true, "convites pausados");
        if (wantDms) note(true, "mensagens diretas pausadas");
      } catch (err) {
        if (wantInvites) note(false, `convites: ${explain(err)}`);
        if (wantDms) note(false, `mensagens diretas: ${explain(err)}`);
      }
    }

    // Verificação
    if (p.actions.includes("verification")) {
      const target = LEVEL[p.level] ?? LEVEL.veryHigh;
      if (guild.verificationLevel >= target) {
        note(true, `verificação já estava em ${LEVEL_NAME[guild.verificationLevel]} ou acima`);
      } else {
        // Se o lockdown automático já subiu a verificação, o nível "de antes" é o que ele guardou
        const lock = cfg.massJoin.lockdown;
        const prev = lock?.prev != null ? lock.prev : guild.verificationLevel;
        try {
          await guild.setVerificationLevel(target, why);
          state.verification = { prev, level: target };
          note(true, `verificação subiu para ${LEVEL_NAME[target]}`);
        } catch (err) {
          note(false, `verificação: ${explain(err)}`);
        }
      }
    }

    // Trancar o chat: tira o envio do cargo @everyone e nega nos canais (guardando como estava)
    if (p.actions.includes("lock")) {
      const everyone = guild.roles.everyone;
      const had = new PermissionsBitField(everyone.permissions).bitfield & lockMask();
      let roleBits = null;
      let roleError = null;
      if (had) {
        try {
          await everyone.setPermissions(new PermissionsBitField(everyone.permissions).remove(had), why);
          roleBits = had.toString();
        } catch (err) {
          roleError = explain(err);
        }
      }

      const chans = await lockChannels(guild, why);
      if (roleBits || chans.done) state.lock = { role: roleBits, channels: chans.saved };

      const parts = [];
      if (roleBits) parts.push("cargo @everyone");
      if (chans.done) parts.push(`${chans.done} canal(is)`);
      if (parts.length) note(true, `chat trancado em: ${parts.join(" e ")}`);
      else if (!roleError && !chans.failed) note(true, "o chat já estava trancado para @everyone");
      if (roleError) note(false, `trancar o cargo @everyone: ${roleError}`);
      if (chans.failed) note(false, `${chans.failed} canal(is) não puderam ser trancados (o bot precisa de Gerenciar permissões e ver o canal)`);
    }

    const applied = state.invites || state.dms || state.verification || state.lock;
    if (!applied) {
      return { title: "Nada foi aplicado", lines: lines.length ? lines : ["Nenhuma ação teve efeito."] };
    }

    await updateAntiRaidConfig(guild.id, { "panic.active": state });
    scheduleEnd(guild, until);

    await sendModuleAlert(guild, cfg, p.alertChannelId, {
      system: "Pânico",
      action: "Pânico ativado",
      author: user,
      authorLabel: "Acionado por",
      color: 0xff0000,
      fields: [["Resultado", lines.map((l) => `\n- ${l}`).join("")], ["Fim previsto", `<t:${Math.floor(until / 1000)}:R>`]],
    });

    return { title: "Pânico ativado", lines };
  } catch (err) {
    console.error("[ANTIRAID] Erro ao ativar o pânico:", err);
    return { title: "Erro ao ativar o pânico", lines: [explain(err)] };
  } finally {
    busy.delete(guild.id);
  }
}

// ======================= Desativar =======================

async function deactivatePanic(guild, user = null, motivo = "Desfeito pelo painel.") {
  if (busy.has(guild.id)) return { title: "Pânico", lines: ["Já tem uma ativação ou desativação em andamento. Espere alguns segundos."] };
  busy.add(guild.id);
  try {
    clearTimeout(timers.get(guild.id));
    timers.delete(guild.id);

    const cfg = await getAntiRaidConfig(guild.id);
    const state = cfg.panic.active;
    if (!state) return { title: "O pânico não estava ativo", lines: [] };

    const why = reasonFor(user, "desfeito");
    const lines = [];
    const note = (ok, text) => lines.push(`${ok ? "feito" : "falhou"}  ${text}`);

    if (state.invites || state.dms) {
      try {
        await setIncident(guild, { invitesUntil: state.invites ? null : undefined, dmsUntil: state.dms ? null : undefined });
        if (state.invites) note(true, "convites liberados");
        if (state.dms) note(true, "mensagens diretas liberadas");
      } catch (err) {
        note(false, `liberar convites/DMs: ${explain(err)}`);
      }
    }

    if (state.verification) {
      const { prev, level } = state.verification;
      if (guild.verificationLevel === level) {
        try {
          await guild.setVerificationLevel(prev, why);
          note(true, `verificação voltou para ${LEVEL_NAME[prev]}`);
        } catch (err) {
          note(false, `verificação: ${explain(err)}`);
        }
      } else {
        note(true, "verificação já tinha sido alterada por outra pessoa; deixei como está");
      }
    }

    if (state.lock) {
      // Formato antigo guardava só os bits do cargo, em texto
      const lock = typeof state.lock === "string" ? { role: state.lock, channels: {} } : state.lock;
      const failures = [];

      if (lock.role) {
        const bits = BigInt(lock.role);
        const everyone = guild.roles.everyone;
        try {
          // Só devolve o que o pânico tirou, sem desfazer mudanças feitas depois
          await everyone.setPermissions(new PermissionsBitField(everyone.permissions).add(bits), why);
        } catch (err) {
          const names = PANIC_LOCK_PERMS.filter((n) => bits & PermissionFlagsBits[n]).join(", ");
          failures.push(`cargo @everyone: ${explain(err)}. Devolva em @everyone: ${names}`);
        }
      }

      const chans = await unlockChannels(guild, lock.channels ?? {}, why);
      if (chans.failed) failures.push(`${chans.failed} canal(is) não voltaram ao normal; confira a permissão de @everyone neles`);

      if (failures.length) failures.forEach((f) => note(false, `destrancar o chat: ${f}`));
      else note(true, "chat destrancado para @everyone");
    }

    // O estado é limpo mesmo se algo falhou; o que ficou pendente aparece como "falhou" acima
    await updateAntiRaidConfig(guild.id, { "panic.active": null });

    await sendModuleAlert(guild, cfg, cfg.panic.alertChannelId, {
      system: "Pânico",
      action: "Pânico desativado",
      author: user ?? undefined,
      authorLabel: "Desfeito por",
      color: 0x00e600,
      fields: [["Motivo", motivo], ["Resultado", lines.map((l) => `\n- ${l}`).join("")]],
    });

    return { title: "Pânico desativado", lines };
  } catch (err) {
    console.error("[ANTIRAID] Erro ao desativar o pânico:", err);
    return { title: "Erro ao desativar o pânico", lines: [explain(err)] };
  } finally {
    busy.delete(guild.id);
  }
}

// ======================= Fim automático =======================

function scheduleEnd(guild, until) {
  clearTimeout(timers.get(guild.id));
  const t = setTimeout(
    () => deactivatePanic(guild, null, "O tempo do pânico acabou.").catch(() => {}),
    Math.max(1000, until - Date.now())
  );
  t.unref?.();
  timers.set(guild.id, t);
}

// Ao ligar o bot: retoma o fim automático (ou desfaz, se o prazo passou)
async function resumePanics(client) {
  for (const guild of client.guilds.cache.values()) {
    const cfg = await getAntiRaidConfig(guild.id);
    const state = cfg.panic.active;
    if (!state) continue;
    if (state.until <= Date.now()) await deactivatePanic(guild, null, "O tempo do pânico acabou enquanto o bot estava fora.");
    else scheduleEnd(guild, state.until);
  }
}

module.exports = { activatePanic, deactivatePanic, resumePanics, missingPerms, LEVEL_NAME };
