const { MessageFlags } = require("discord.js");
const {
  getRoleManageConfig,
  updateRoleManageConfig,
  resetRoleManageConfig,
  isManager,
  isConfigAdmin,
  canManageRole,
  collectRoles,
  searchRoles,
  ensureMembers,
  encodeState,
  decodeState,
} = require("../utils/roleManage");
const { TEXT_KEYS, DEFAULT_TEXTS } = require("../utils/roleManageDefaults");
const { getPrefix } = require("../utils/getPrefix");
const { suppressRoleChange, unsuppressRoleChange } = require("../utils/logs/suppress");
const { logPanelRoleChange } = require("../utils/logs/panelRoles");
const { buildRolePanel, buildSearchModal, buildNotice } = require("../ui/grolesPanel");
const {
  buildRoleManageHome,
  buildRuleEditor,
  buildTextsModal,
  buildOtherModal,
  MODAL_FIELDS,
  MAX_RULES,
} = require("../ui/grolesConfig");

const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL = MessageFlags.Ephemeral;

const clean = (value) => String(value ?? "").trim();
const noMentions = { parse: [] };

// Aviso efêmero em Components V2 (serve antes ou depois do deferUpdate)
async function deny(interaction, content) {
  const payload = { components: buildNotice(content), flags: V2 | EPHEMERAL };
  if (interaction.deferred || interaction.replied) return interaction.followUp(payload).catch(() => {});
  return interaction.reply(payload).catch(() => {});
}

// Painel antigo (de antes de uma atualização) ou com botão inválido: antes saía em silêncio
const staleNotice = (interaction) =>
  deny(interaction, "Esse painel é de uma versão antiga ou está inválido. Use o comando de novo para abrir um painel novo.");

// ======================= Painel do comando groles =======================

// Monta os componentes do painel para um estado (usado pelo comando e pelas interações)
async function renderRolePanel({ guild, executor, state, results = null }) {
  const cfg = await getRoleManageConfig(guild.id);
  // Carregar todos os membros pode levar até 20s; o painel não espera por isso (só uns instantes).
  // A contagem de membros por cargo se completa assim que o carregamento termina em segundo plano.
  await Promise.race([ensureMembers(guild), new Promise((resolve) => setTimeout(resolve, 2000))]);

  const target = state.t ? await guild.members.fetch(state.t).catch(() => null) : null;
  const role = state.r ? guild.roles.cache.get(state.r) ?? null : null;

  const items = state.v === "l" ? collectRoles(guild, cfg, executor, target, state.f) : [];
  const holders =
    state.v === "h" && role
      ? [...role.members.values()].sort((a, b) =>
          a.displayName.localeCompare(b.displayName, "pt-BR", { sensitivity: "base" })
        )
      : [];

  return buildRolePanel({ cfg, guild, executor, target, role, state, results, items, holders });
}

// Só quem abriu o painel mexe nele, e só enquanto ainda tiver permissão
async function guardPanel(interaction, state) {
  if (interaction.user.id !== state.a) {
    await deny(interaction, "Só quem abriu este painel pode usá-lo.");
    return null;
  }
  const cfg = await getRoleManageConfig(interaction.guild.id);
  if (!cfg.enabled || !isManager(cfg, interaction.member)) {
    await deny(interaction, "Você não tem permissão para usar este painel.");
    return null;
  }
  return cfg;
}

async function show(interaction, state, results = null) {
  const components = await renderRolePanel({
    guild: interaction.guild,
    executor: interaction.member,
    state,
    results,
  });
  // Só components, igual aos outros painéis do bot (mandar flags/allowedMentions aqui travava a edição)
  return interaction.editReply({ components });
}

async function applyChange(interaction, state, kind) {
  await interaction.deferUpdate();

  const { guild } = interaction;
  const cfg = await getRoleManageConfig(guild.id);
  const executor = interaction.member;
  const role = state.r ? guild.roles.cache.get(state.r) : null;
  const targetId = state.x ?? state.t;
  const target = targetId ? await guild.members.fetch(targetId).catch(() => null) : null;
  const next = { ...state, x: null };

  if (!role) {
    await deny(interaction, "Esse cargo não existe mais.");
  } else if (!target) {
    await deny(interaction, "Essa pessoa não está mais no servidor.");
  } else if (!canManageRole(cfg, executor, role.id)) {
    await deny(interaction, `Você não tem permissão para gerenciar o cargo <@&${role.id}>.`);
  } else if (!role.editable) {
    await deny(
      interaction,
      "Não consigo gerenciar esse cargo. Confira se eu tenho a permissão Gerenciar Cargos e se o cargo está abaixo do meu cargo mais alto."
    );
  } else {
    const has = target.roles.cache.has(role.id);
    if (kind === "rem" && !has) {
      await deny(interaction, "Essa pessoa não tem mais esse cargo.");
    } else if (kind === "add" && has) {
      await deny(interaction, "Essa pessoa já tem esse cargo.");
    } else {
      const reason = `Gerenciamento de cargos por ${interaction.user.username} (${interaction.user.id})`;
      // Marca antes de alterar: o log genérico de cargos ignora essa mudança e o painel envia o log próprio
      suppressRoleChange(guild.id, target.id, role.id, kind);
      let changed = false;
      try {
        if (kind === "add") await target.roles.add(role, reason);
        else await target.roles.remove(role, reason);
        changed = true;
      } catch (err) {
        unsuppressRoleChange(guild.id, target.id, role.id, kind);
        console.error("[GROLES] Erro ao alterar cargo:", err);
        await deny(interaction, "Não consegui alterar o cargo dessa pessoa.");
      }
      if (changed) {
        logPanelRoleChange({ guild, executor: interaction.user, target, role, kind }).catch((err) =>
          console.error("[GROLES] Erro ao registrar log:", err)
        );
      }
      // O cache do membro só atualiza quando o evento do gateway chega; força a leitura para o painel já sair certo
      await guild.members.fetch({ user: target.id, force: true }).catch(() => {});
    }
  }

  return show(interaction, next);
}

async function handleRoleManageButton(interaction) {
  const [, action, raw] = interaction.customId.split(":");
  const state = decodeState(raw);
  if (!state) return staleNotice(interaction);

  const cfg = await guardPanel(interaction, state);
  if (!cfg) return;

  if (action === "noop") return interaction.deferUpdate();

  if (action === "srch") {
    return interaction.showModal(buildSearchModal({ guild: interaction.guild, state }));
  }

  if (action === "rem" || action === "add") return applyChange(interaction, state, action);

  // Navegação (flt, pg, hold, back, det): o botão já carrega o estado de destino
  if (["flt", "pg", "hold", "back", "det"].includes(action)) {
    await interaction.deferUpdate();
    return show(interaction, state);
  }

  return staleNotice(interaction);
}

async function handleRoleManageSelect(interaction) {
  const [, action, raw] = interaction.customId.split(":");
  const state = decodeState(raw);
  if (!state) return staleNotice(interaction);

  const cfg = await guardPanel(interaction, state);
  if (!cfg) return;

  await interaction.deferUpdate();

  if (action === "pick") {
    const next = { ...state, t: interaction.values[0], x: null, p: 0 };
    if (next.v === "h" || next.v === "s") next.v = "d";
    return show(interaction, next);
  }

  if (action === "sel") {
    return show(interaction, { ...state, r: interaction.values[0], v: "d", x: null, p: 0 });
  }
}

// Lê o cargo escolhido no select do modal (select de cargos, ou select comum no fallback)
function readSelectedRole(fields, id) {
  try {
    const roles = fields.getSelectedRoles?.(id, false);
    if (roles?.size) return roles.first().id;
  } catch {}
  try {
    const values = fields.getStringSelectValues?.(id);
    if (values?.length) return values[0];
  } catch {}
  return null;
}

async function handleRoleManageModal(interaction) {
  const [, raw] = interaction.customId.split(":");
  const state = decodeState(raw);
  if (!state) return staleNotice(interaction);

  const cfg = await guardPanel(interaction, state);
  if (!cfg) return;

  if (!interaction.isFromMessage()) return deny(interaction, "Abra a busca pelo botão do painel.");
  await interaction.deferUpdate();

  const { guild } = interaction;
  let query = "";
  try {
    query = clean(interaction.fields.getTextInputValue("q"));
  } catch {}
  const selectedId = readSelectedRole(interaction.fields, "sel");

  let matches = [];
  if (selectedId) {
    const role = guild.roles.cache.get(selectedId);
    if (role && role.id !== guild.id && !role.managed) matches = [role];
  } else if (query) {
    matches = searchRoles(guild, query);
  } else {
    return deny(interaction, "Digite o nome ou o ID do cargo, ou escolha um cargo na lista.");
  }

  if (!matches.length) {
    const shown = (selectedId ? "o cargo escolhido" : `\`${query.replaceAll("`", "'").slice(0, 60)}\``);
    return deny(interaction, `Nenhum cargo encontrado para ${shown}.`);
  }

  if (matches.length === 1) {
    return show(interaction, { ...state, v: "d", r: matches[0].id, x: null, p: 0 });
  }
  return show(interaction, { ...state, v: "s", r: null, x: null, p: 0 }, matches);
}

// ======================= Configuração (n!menu → Moderação → Gerenciamento de cargos) =======================

async function guardConfig(interaction) {
  const cfg = await getRoleManageConfig(interaction.guild.id);
  if (isConfigAdmin(cfg, interaction.member)) return cfg;
  await deny(interaction, "Você não tem permissão para configurar o gerenciamento de cargos.");
  return null;
}

async function homePanel(guild) {
  const [cfg, prefix] = await Promise.all([getRoleManageConfig(guild.id), getPrefix(guild.id)]);
  return buildRoleManageHome(guild, cfg, prefix);
}

async function openRoleManagePanel(interaction) {
  if (!(await guardConfig(interaction))) return;
  return interaction.update({ components: await homePanel(interaction.guild) });
}

const findRule = (cfg, id) => cfg.rules.find((rule) => rule.managerId === id);
const saveRules = (guildId, rules) => updateRoleManageConfig(guildId, { rules });

async function handleRoleManageConfigSelect(interaction) {
  const cfg = await guardConfig(interaction);
  if (!cfg) return;
  const { guild } = interaction;
  const [action, managerId] = interaction.customId.split(":");

  // Escolheu uma regra existente para editar
  if (action === "rmcfg_pick") {
    const rule = findRule(cfg, interaction.values[0]);
    if (!rule) return interaction.update({ components: await homePanel(guild) });
    return interaction.update({ components: buildRuleEditor(guild, rule) });
  }

  // Adicionou um cargo gerenciador novo
  if (action === "rmcfg_addmgr") {
    const role = guild.roles.cache.get(interaction.values[0]);
    if (!role || role.id === guild.id || role.managed) {
      return deny(interaction, "Esse cargo não pode ser usado como gerenciador.");
    }
    let rule = findRule(cfg, role.id);
    if (!rule) {
      if (cfg.rules.length >= MAX_RULES) {
        return deny(interaction, `O limite é de ${MAX_RULES} cargos gerenciadores.`);
      }
      rule = { managerId: role.id, blocked: [] };
      await saveRules(guild.id, [...cfg.rules, rule]);
    }
    return interaction.update({ components: buildRuleEditor(guild, rule) });
  }

  // Trocou a lista de cargos bloqueados de uma regra
  if (action === "rmcfg_blocked") {
    const rule = findRule(cfg, managerId);
    if (!rule) return interaction.update({ components: await homePanel(guild) });
    const blocked = interaction.values.filter((id) => id !== guild.id);
    const rules = cfg.rules.map((r) => (r.managerId === managerId ? { ...r, blocked } : r));
    await saveRules(guild.id, rules);
    return interaction.update({ components: buildRuleEditor(guild, { managerId, blocked }) });
  }
}

async function handleRoleManageConfigButton(interaction) {
  const cfg = await guardConfig(interaction);
  if (!cfg) return;
  const { guild } = interaction;
  const [action, key] = interaction.customId.split(":");

  switch (action) {
    case "rmcfg_home":
      return interaction.update({ components: await homePanel(guild) });

    case "rmcfg_toggle":
      await updateRoleManageConfig(guild.id, { enabled: !cfg.enabled });
      return interaction.update({ components: await homePanel(guild) });

    case "rmcfg_reset_rules":
      await resetRoleManageConfig(guild.id, ["rules"]);
      return interaction.update({ components: await homePanel(guild) });

    case "rmcfg_reset_ui":
      await resetRoleManageConfig(guild.id, [
        ...TEXT_KEYS.map((k) => `texts.${k}`),
        "color",
        "thumbnail",
        "perPage",
      ]);
      return interaction.update({ components: await homePanel(guild) });

    case "rmcfg_perpage": {
      const next = cfg.perPage >= 5 ? 3 : cfg.perPage + 1;
      await updateRoleManageConfig(guild.id, { perPage: next });
      return interaction.update({ components: await homePanel(guild) });
    }

    case "rmcfg_clearblocked": {
      const rule = findRule(cfg, key);
      if (!rule) return interaction.update({ components: await homePanel(guild) });
      await saveRules(
        guild.id,
        cfg.rules.map((r) => (r.managerId === key ? { ...r, blocked: [] } : r))
      );
      return interaction.update({ components: buildRuleEditor(guild, { managerId: key, blocked: [] }) });
    }

    case "rmcfg_delrule":
      await saveRules(
        guild.id,
        cfg.rules.filter((r) => r.managerId !== key)
      );
      return interaction.update({ components: await homePanel(guild) });

    case "rmcfg_edit": {
      if (key === "other") return interaction.showModal(buildOtherModal(cfg));
      if (MODAL_FIELDS[key]) return interaction.showModal(buildTextsModal(key, cfg));
      return;
    }
  }
}

function parseColor(raw) {
  const value = raw.toLowerCase();
  if (!value || ["nenhuma", "nenhum", "sem cor", "sem", "none"].includes(value)) return { ok: true, value: null };
  const match = value.match(/^#?([0-9a-f]{6})$/);
  return match ? { ok: true, value: parseInt(match[1], 16) } : { ok: false };
}

function parseThumbnail(raw) {
  const value = raw.toLowerCase();
  if (!value || value === "auto" || value === "automatica" || value === "automática") return { ok: true, value: null };
  if (["nenhuma", "nenhum", "none", "sem"].includes(value)) return { ok: true, value: "none" };
  if (["servidor", "server"].includes(value)) return { ok: true, value: "server" };
  if (/^https?:\/\/\S+$/i.test(raw)) return { ok: true, value: raw };
  return { ok: false };
}

async function handleRoleManageConfigModal(interaction) {
  const cfg = await guardConfig(interaction);
  if (!cfg) return;
  const { guild } = interaction;
  const [, kind] = interaction.customId.split(":");
  const read = (id) => {
    try {
      return clean(interaction.fields.getTextInputValue(id));
    } catch {
      return "";
    }
  };

  const patch = {};
  if (MODAL_FIELDS[kind]) {
    // Texto igual ao padrão (ou vazio) volta a ser "padrão", assim mudanças futuras do padrão valem para o servidor
    for (const [id] of MODAL_FIELDS[kind].fields) {
      const value = read(id);
      patch[`texts.${id}`] = value && value !== DEFAULT_TEXTS[id] ? value : null;
    }
  } else if (kind === "other") {
    const color = parseColor(read("color"));
    if (!color.ok) return deny(interaction, "Cor inválida. Use o formato #RRGGBB (ex.: #5865F2) ou deixe vazio.");
    const thumb = parseThumbnail(read("thumbnail"));
    if (!thumb.ok) {
      return deny(interaction, "Miniatura inválida. Use um link http(s), \"nenhuma\", \"servidor\" ou deixe vazio.");
    }
    patch.color = color.value;
    patch.thumbnail = thumb.value;
    for (const id of ["footer", "emptyList", "detail"]) {
      const value = read(id);
      patch[`texts.${id}`] = value && value !== DEFAULT_TEXTS[id] ? value : null;
    }
  } else {
    return;
  }

  await updateRoleManageConfig(guild.id, patch);
  const components = await homePanel(guild);
  if (interaction.isFromMessage()) return interaction.update({ components });
  return interaction.reply({ components, flags: V2 | EPHEMERAL });
}

// Todo clique do painel passa por aqui: aparece no log da Render e, se algo falhar, a pessoa recebe um aviso
// (antes o erro era engolido e o botão parecia não fazer nada)
const safe = (kind, fn) => async (interaction) => {
  const parts = String(interaction.customId).split(":");
  const action = kind === "modal" ? "buscar" : parts[1];
  try {
    return await fn(interaction);
  } catch (err) {
    console.error(`[GROLES] Erro em ${kind}:${action}:`, err);
    return deny(interaction, "Não consegui atualizar o painel. Abra um novo com o comando e tente de novo.");
  }
};

module.exports = {
  renderRolePanel,
  handleRoleManageButton: safe("botao", handleRoleManageButton),
  handleRoleManageSelect: safe("select", handleRoleManageSelect),
  handleRoleManageModal: safe("modal", handleRoleManageModal),
  openRoleManagePanel,
  handleRoleManageConfigSelect,
  handleRoleManageConfigButton,
  handleRoleManageConfigModal,
};
