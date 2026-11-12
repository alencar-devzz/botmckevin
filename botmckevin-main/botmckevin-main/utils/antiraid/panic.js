const { PermissionFlagsBits, PermissionsBitField, GuildVerificationLevel } = require("discord.js");
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

    // Trancar o chat: tira permissões de @everyone (só as que ele tinha) e guarda quais foram
    if (p.actions.includes("lock")) {
      const everyone = guild.roles.everyone;
      const had = new PermissionsBitField(everyone.permissions).bitfield & lockMask();
      if (!had) {
        note(true, "@everyone já não tinha permissão de escrever");
      } else {
        try {
          await everyone.setPermissions(new PermissionsBitField(everyone.permissions).remove(had), why);
          state.lock = had.toString();
          note(true, "chat trancado para @everyone");
        } catch (err) {
          note(false, `trancar o chat: ${explain(err)}`);
        }
      }
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
      color: 0xed4245,
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
      const bits = BigInt(state.lock);
      const everyone = guild.roles.everyone;
      try {
        // Só devolve o que o pânico tirou, sem desfazer mudanças feitas depois
        await everyone.setPermissions(new PermissionsBitField(everyone.permissions).add(bits), why);
        note(true, "chat destrancado para @everyone");
      } catch (err) {
        const names = PANIC_LOCK_PERMS.filter((n) => bits & PermissionFlagsBits[n]).join(", ");
        note(false, `destrancar o chat: ${explain(err)}. Devolva em @everyone: ${names}`);
      }
    }

    // O estado é limpo mesmo se algo falhou; o que ficou pendente aparece como "falhou" acima
    await updateAntiRaidConfig(guild.id, { "panic.active": null });

    await sendModuleAlert(guild, cfg, cfg.panic.alertChannelId, {
      system: "Pânico",
      action: "Pânico desativado",
      author: user ?? undefined,
      authorLabel: "Desfeito por",
      color: 0x3ba55d,
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
