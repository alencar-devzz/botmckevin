const {
  AttachmentBuilder,
  ContainerBuilder,
  MessageFlags,
  PermissionFlagsBits,
  TextDisplayBuilder,
  TextInputStyle,
} = require("discord.js");
const { textLabel, userSelectLabel, modal } = require("../ui/modalHelpers");
const { buildView, PER_PAGE, pageCount } = require("../ui/unbanall");
const {
  CONFIRM_MS,
  BANS_CACHE_MS,
  jobs,
  getSession,
  touch,
  closeSession,
} = require("../utils/unbanall/state");
const { markMassUnban, endMassUnban, markCommandExit, clearCommandExit } = require("../utils/logs/suppress");
const { activeCategory, deliver } = require("../utils/logs/send");
const { COLORS, code } = require("../utils/logs/format");

const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL = MessageFlags.Ephemeral;
const NO_MENTIONS = { parse: [] };
const MAX_ADD = 25; // pessoas por banimento em lote
const RENDER_EVERY_MS = 3000; // a barra de progresso se atualiza a cada 3 segundos

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const tagOf = (user) => user.tag ?? user.username;

// ---------- Utilidades ----------

function notice(content) {
  return {
    components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(content))],
    flags: V2 | EPHEMERAL,
    allowedMentions: NO_MENTIONS,
  };
}

// Redesenha o painel (edita a mensagem direto, como os outros painéis públicos do bot)
async function render(session) {
  const components = buildView(session);
  session.notice = null;
  return session.message.edit({ components, flags: V2, allowedMentions: NO_MENTIONS });
}

// Lê todos os banidos (a API entrega até 1000 por vez)
async function fetchAllBans(guild) {
  const all = [];
  let after;
  for (let i = 0; i < 50; i++) {
    const batch = await guild.bans.fetch({ limit: 1000, after, cache: false });
    if (!batch.size) break;
    let maxId = null;
    for (const ban of batch.values()) {
      const user = ban.user;
      all.push({
        id: user.id,
        username: user.username,
        globalName: user.globalName ?? null,
        tag: tagOf(user),
        reason: ban.reason ?? null,
        avatar: user.displayAvatarURL({ extension: "png", size: 256 }),
      });
      if (maxId === null || BigInt(user.id) > BigInt(maxId)) maxId = user.id;
    }
    if (batch.size < 1000) break;
    after = maxId;
  }
  return all.sort((a, b) => a.username.localeCompare(b.username));
}

async function loadBans(session, force = false) {
  if (!force && session.bans && Date.now() - session.bansAt < BANS_CACHE_MS) return true;
  try {
    session.bans = await fetchAllBans(session.guild);
    session.bansAt = Date.now();
    session.bansError = false;
    return true;
  } catch (err) {
    console.error("[UNBALL] Não consegui ler os banidos:", err?.message ?? err);
    session.bansError = true;
    session.notice = "Não consegui ler a lista de banidos. Verifique a minha permissão Banir Membros.";
    return false;
  }
}

// Confere sessão, dono do painel e permissão. Responde sozinho quando algo falha.
async function guard(interaction, messageId) {
  const session = getSession(messageId);
  if (!session) {
    await interaction
      .reply(notice("Este painel expirou. Use o comando `unbanall` de novo."))
      .catch(() => {});
    return null;
  }
  if (interaction.user.id !== session.authorId) {
    await interaction.reply(notice("Só quem abriu este painel pode usá-lo.")).catch(() => {});
    return null;
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers)) {
    await interaction.reply(notice("Você não tem permissão para banir e desbanir membros.")).catch(() => {});
    return null;
  }
  touch(session);
  return session;
}

// Abre uma confirmação que expira sozinha
function openConfirm(session, conf, executor) {
  if (session.confirm?.timer) clearTimeout(session.confirm.timer);
  conf.executorId = executor.id;
  conf.expiresAt = Date.now() + CONFIRM_MS;
  conf.timer = setTimeout(() => {
    if (session.confirm !== conf) return;
    session.confirm = null;
    session.view = conf.back;
    session.notice = "A confirmação expirou.";
    render(session).catch(() => {});
  }, CONFIRM_MS);
  session.confirm = conf;
  session.view = "confirm";
}

function cancelConfirm(session) {
  if (session.confirm?.timer) clearTimeout(session.confirm.timer);
  const back = session.confirm?.back ?? "home";
  session.confirm = null;
  session.view = back;
}

// ---------- Trabalho em andamento (desbanimento em massa / banimento em lote) ----------

function errorText(err) {
  switch (err?.code) {
    case 50013:
    case 50001:
      return "sem permissão (hierarquia de cargos?)";
    case 10013:
      return "usuário não encontrado";
    case 10026:
      return "já não estava banido";
    default:
      return String(err?.message ?? "erro desconhecido").slice(0, 80);
  }
}

async function runJob(session, job, execute) {
  const { guild } = session;
  let permissionStreak = 0;

  for (const id of job.ids) {
    if (job.cancel) {
      job.interrupted = true;
      break;
    }

    try {
      await execute(id);
      job.ok++;
      permissionStreak = 0;
    } catch (err) {
      if (err?.code === 10026) {
        job.skipped++;
        permissionStreak = 0;
      } else {
        job.failed++;
        if (job.failures.length < 50) job.failures.push({ id, why: errorText(err) });
        if (err?.code === 50013 || err?.code === 50001) {
          if (++permissionStreak >= 5) {
            job.aborted = "faltou permissão várias vezes seguidas";
            break;
          }
        } else {
          permissionStreak = 0;
        }
      }
    }
    job.done++;

    // A barra só se atualiza a cada poucos segundos (limite de edições do Discord)
    if (Date.now() - job.lastRender >= RENDER_EVERY_MS && !job.rendering) {
      job.lastRender = Date.now();
      job.rendering = true;
      render(session)
        .catch(() => {})
        .finally(() => {
          job.rendering = false;
        });
    }
  }

  while (job.rendering) await sleep(100);

  job.finished = true;
  job.finishedAt = Date.now();
  jobs.delete(guild.id);
  if (job.kind === "all") endMassUnban(guild.id);

  session.job = null;
  session.result = {
    kind: job.kind,
    ok: job.ok,
    failed: job.failed,
    skipped: job.skipped,
    done: job.done,
    total: job.total,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    reason: job.reason,
    executorId: job.executorId,
    interrupted: job.interrupted,
    aborted: job.aborted,
    failures: job.failures,
  };
  session.view = "done";
  session.bans = null; // a lista mudou: será lida de novo
  touch(session);

  await render(session).catch(async (err) => {
    console.error("[UNBALL] Não consegui atualizar o painel no fim:", err?.message ?? err);
    // O painel pode ter sido apagado: avisa o resultado numa mensagem nova
    await session.message.channel
      ?.send({ components: buildView(session), flags: V2, allowedMentions: NO_MENTIONS })
      .catch(() => {});
  });

  if (job.kind === "all") await sendSummaryLog(guild, job);
}

// Um único log para o desbanimento em massa inteiro (os logs individuais ficam de fora)
async function sendSummaryLog(guild, job) {
  const cfg = await activeCategory(guild, "banimentos");
  if (!cfg) return;
  await deliver(guild, cfg, {
    title: `Desbanimento em massa — ${guild.name}`,
    color: COLORS.green,
    groups: [
      [`**Executado por:** <@${job.executorId}>`, `**Desbanidos:** ${code(job.ok)}`, `**Falhas:** ${code(job.failed)}`],
      [`**Motivo:** ${job.reason}`],
    ],
  });
}

function newJob(session, { kind, ids, reason, executorId }) {
  return {
    kind,
    ids,
    total: ids.length,
    reason,
    executorId,
    done: 0,
    ok: 0,
    failed: 0,
    skipped: 0,
    failures: [],
    cancel: false,
    interrupted: false,
    aborted: null,
    finished: false,
    rendering: false,
    lastRender: Date.now(),
    startedAt: Date.now(),
    finishedAt: null,
  };
}

async function startMassUnban(session, conf) {
  const { guild } = session;
  if (jobs.has(guild.id)) {
    session.view = conf.back;
    session.notice = "Já existe uma ação em andamento neste servidor.";
    return render(session);
  }

  const job = newJob(session, { kind: "all", ids: conf.ids, reason: conf.reason, executorId: conf.executorId });
  jobs.set(guild.id, job);
  markMassUnban(guild.id);
  session.job = job;
  session.view = "progress";
  await render(session).catch(() => {});

  runJob(session, job, (id) => guild.members.unban(id, job.reason)).catch((err) =>
    console.error("[UNBALL] Erro no desbanimento em massa:", err)
  );
}

async function startMassBan(session, conf) {
  const { guild } = session;
  if (jobs.has(guild.id)) {
    session.view = conf.back;
    session.notice = "Já existe uma ação em andamento neste servidor.";
    return render(session);
  }

  const job = newJob(session, {
    kind: "add",
    ids: conf.users.map((u) => u.id),
    reason: conf.reason,
    executorId: conf.executorId,
  });
  jobs.set(guild.id, job);
  session.job = job;
  session.view = "progress";
  await render(session).catch(() => {});

  const hasMember = new Set(conf.users.filter((u) => u.inGuild).map((u) => u.id));
  runJob(session, job, async (id) => {
    // Banimento pelo comando: só o log de Banimento é enviado (ver utils/logs/suppress.js)
    if (hasMember.has(id)) markCommandExit(guild.id, id, "ban");
    try {
      await guild.members.ban(id, { reason: job.reason });
    } catch (err) {
      clearCommandExit(guild.id, id);
      throw err;
    }
  }).catch((err) => console.error("[UNBALL] Erro no banimento em lote:", err));
}

async function unbanOne(session, conf) {
  const { guild } = session;
  try {
    await guild.members.unban(conf.userId, conf.reason);
    session.notice = `**${conf.tag}** foi desbanido com sucesso.`;
  } catch (err) {
    session.notice =
      err?.code === 10026
        ? `**${conf.tag}** já não estava banido.`
        : `Não consegui desbanir **${conf.tag}** (${errorText(err)}).`;
  }
  session.bans = (session.bans ?? []).filter((b) => b.id !== conf.userId);
  session.view = "list";
  session.page = Math.min(session.page, pageCount(session));
  return render(session);
}

// ---------- Botões ----------

async function handleUnbanallButton(interaction) {
  const action = interaction.customId.split(":")[1];
  const session = await guard(interaction, interaction.message?.id);
  if (!session) return;
  const { guild } = session;

  // Botões que abrem janela: precisam responder direto, sem confirmar antes
  if (action === "add") {
    return interaction.showModal(
      modal(
        `uba:m:add:${session.message.id}`,
        "Banir pessoas",
        userSelectLabel({
          id: "users",
          label: "Pessoas",
          description: `Escolha até ${MAX_ADD} pessoas do servidor.`,
          max: MAX_ADD,
          required: false,
          placeholder: "Selecione quem será banido",
        }),
        textLabel({
          id: "ids",
          label: "IDs (opcional)",
          description: "Para quem já saiu do servidor. Separe por espaço ou linha.",
          style: TextInputStyle.Paragraph,
          max: 1000,
          required: false,
          placeholder: "123456789012345678 987654321098765432",
        }),
        textLabel({
          id: "reason",
          label: "Motivo",
          description: "Vazio = motivo padrão.",
          max: 300,
          required: false,
          placeholder: "Ex.: spam",
        })
      )
    );
  }
  if (action === "search") {
    return interaction.showModal(
      modal(
        `uba:m:search:${session.message.id}`,
        "Buscar banidos",
        textLabel({
          id: "q",
          label: "Nome, ID ou motivo",
          description: "Vazio = mostrar todos.",
          max: 100,
          required: false,
          value: session.query || undefined,
          placeholder: "Ex.: spam",
        })
      )
    );
  }

  if (action === "export") {
    if (!(await loadBans(session))) {
      await interaction.deferUpdate().catch(() => {});
      return render(session);
    }
    const lines = session.bans.map(
      (b) => `${b.id} | ${b.username} | ${(b.reason ?? "sem motivo").replace(/\s+/g, " ")}`
    );
    const file = new AttachmentBuilder(
      Buffer.from([`Banidos de ${guild.name} (${lines.length})`, "id | usuário | motivo", ...lines].join("\n"), "utf8"),
      { name: `banidos-${guild.id}.txt` }
    );
    return interaction.reply({
      content: `Lista com ${lines.length} ${lines.length === 1 ? "banido" : "banidos"}.`,
      files: [file],
      flags: EPHEMERAL,
    });
  }

  await interaction.deferUpdate();

  switch (action) {
    case "close":
      if (session.job && !session.job.finished) {
        session.notice = "Há uma ação em andamento. Pare antes de fechar.";
        return render(session);
      }
      return closeSession(session);

    case "refresh":
      await loadBans(session, true);
      return render(session);

    case "home":
      if (session.job) return render(session);
      session.view = "home";
      await loadBans(session);
      return render(session);

    case "list":
      if (!(await loadBans(session))) return render(session);
      session.view = "list";
      session.page = 1;
      session.query = "";
      return render(session);

    case "prev":
    case "next":
      session.page = Math.min(
        Math.max(1, session.page + (action === "next" ? 1 : -1)),
        pageCount(session)
      );
      return render(session);

    case "all": {
      if (jobs.has(guild.id)) {
        session.notice = "Já existe uma ação em andamento neste servidor.";
        return render(session);
      }
      if (!(await loadBans(session, true))) return render(session);
      if (!session.bans.length) {
        session.notice = "Não há ninguém banido neste servidor.";
        return render(session);
      }
      openConfirm(
        session,
        {
          kind: "all",
          back: "home",
          ids: session.bans.map((b) => b.id),
          reason: `Desbanimento em massa por ${tagOf(interaction.user)} (unbanall)`,
        },
        interaction.user
      );
      return render(session);
    }

    case "yes": {
      const conf = session.confirm;
      if (!conf) return render(session);
      if (conf.expiresAt < Date.now()) {
        cancelConfirm(session);
        session.notice = "A confirmação expirou.";
        return render(session);
      }
      clearTimeout(conf.timer);
      session.confirm = null;
      if (conf.kind === "all") return startMassUnban(session, conf);
      if (conf.kind === "add") return startMassBan(session, conf);
      return unbanOne(session, conf);
    }

    case "no":
      cancelConfirm(session);
      session.notice = "Ação cancelada.";
      return render(session);

    case "stop":
      if (session.job && !session.job.finished) session.job.cancel = true;
      return render(session);

    default:
      return render(session);
  }
}

// ---------- Menu: escolher um banido ----------

async function handleUnbanallSelect(interaction) {
  if (interaction.customId !== "uba:pick") return;
  const session = await guard(interaction, interaction.message?.id);
  if (!session) return;
  await interaction.deferUpdate();

  const ban = session.bans?.find((b) => b.id === interaction.values[0]);
  if (!ban) {
    session.notice = "Esse usuário não está mais na lista.";
    return render(session);
  }

  openConfirm(
    session,
    {
      kind: "one",
      back: "list",
      userId: ban.id,
      tag: ban.tag,
      avatar: ban.avatar,
      banReason: ban.reason,
      reason: `Unban pelo painel unbanall por ${tagOf(interaction.user)}`,
    },
    interaction.user
  );
  return render(session);
}

// ---------- Janelas ----------

// Descobre quem pode mesmo ser banido e por que alguns ficam de fora
async function checkTargets(interaction, ids) {
  const { guild, client } = interaction;
  const executor = interaction.member;
  const valid = [];
  const skipped = [];

  await Promise.all(
    ids.map(async (id) => {
      const skip = (why) => skipped.push({ id, why });
      if (id === interaction.user.id) return skip("é você");
      if (id === client.user.id) return skip("sou eu");
      if (id === guild.ownerId) return skip("dono do servidor");

      const user = await client.users.fetch(id).catch(() => null);
      if (!user) return skip("usuário não encontrado");

      const banned = await guild.bans.fetch({ user: id, force: true }).catch(() => null);
      if (banned) return skip("já está banido");

      const member = await guild.members.fetch(id).catch(() => null);
      if (member) {
        const ownerRuns = interaction.user.id === guild.ownerId;
        if (!ownerRuns && executor.roles.highest.comparePositionTo(member.roles.highest) <= 0) {
          return skip("cargo igual ou superior ao seu");
        }
        if (!member.bannable) return skip("meu cargo não alcança essa pessoa");
      }

      valid.push({ id, username: user.username, inGuild: Boolean(member) });
    })
  );

  // Mantém a ordem em que foram digitados
  valid.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  return { valid, skipped };
}

// IDs escolhidos no select de usuários do modal
function selectedUserIds(fields, id) {
  try {
    const users = fields.getSelectedUsers(id, false);
    if (users) return [...users.keys()];
  } catch {
    // versão da biblioteca sem esse método: cai para o valor bruto do campo
  }
  try {
    return [...(fields.getField(id)?.values ?? [])];
  } catch {
    return [];
  }
}

async function handleUnbanallModal(interaction) {
  const [, , kind, messageId] = interaction.customId.split(":");
  const session = await guard(interaction, messageId);
  if (!session) return;
  await interaction.deferUpdate();

  if (kind === "search") {
    session.query = interaction.fields.getTextInputValue("q").trim();
    session.page = 1;
    session.view = "list";
    return render(session);
  }

  if (kind !== "add") return;

  // Pessoas escolhidas no select + IDs digitados (sem repetir)
  const picked = selectedUserIds(interaction.fields, "users");
  const typedIds = interaction.fields.getTextInputValue("ids").match(/\d{17,20}/g) ?? [];
  const ids = [...new Set([...picked, ...typedIds])].slice(0, MAX_ADD);
  if (!ids.length) {
    session.notice = "Escolha alguém no menu ou informe um ID para banir.";
    return render(session);
  }

  const { valid, skipped } = await checkTargets(interaction, ids);
  if (!valid.length) {
    session.notice = `Ninguém pôde ser banido: ${skipped
      .slice(0, 3)
      .map((s) => `\`${s.id}\` (${s.why})`)
      .join(", ")}.`;
    return render(session);
  }

  const typed = interaction.fields.getTextInputValue("reason").trim().slice(0, 400);
  openConfirm(
    session,
    {
      kind: "add",
      back: "home",
      users: valid,
      skipped,
      reason: typed || `Banido em lote por ${tagOf(interaction.user)} (unbanall)`,
    },
    interaction.user
  );
  return render(session);
}

module.exports = { handleUnbanallButton, handleUnbanallSelect, handleUnbanallModal, fetchAllBans };
