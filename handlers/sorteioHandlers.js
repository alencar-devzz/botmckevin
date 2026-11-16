const { MessageFlags } = require("discord.js");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");
const store = require("../utils/sorteio/store");
const engine = require("../utils/sorteio/engine");
const D = require("../utils/sorteio/defaults");
const { buildMessage } = require("../utils/sorteio/render");
const { saveImage, dropSources, parseHex } = require("../utils/msgBuilder/store");
const { parseEmoji } = require("../utils/msgBuilder/render");
const ui = require("../ui/sorteio");
const modals = require("../ui/sorteioModals");

// /sorteio: botões e menus (customId "sr:<ação>:<sorteio>[:<bloco>[:<qual>]]").
// Textos, imagens e emojis entram por modais (ui/sorteioModals.js).

const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL = MessageFlags.Ephemeral;

// Ações que qualquer pessoa pode usar (botões da mensagem pública)
const PUBLIC = new Set(["join", "leave", "pl", "noop"]);

const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };

function parseSpan(raw) {
  const s = String(raw ?? "").toLowerCase().replace(/\s+/g, "");
  if (!/^(\d+[smhdw])+$/.test(s)) return null;
  let total = 0;
  for (const m of s.matchAll(/(\d+)([smhdw])/g)) total += Number(m[1]) * UNIT_MS[m[2]];
  return total;
}

const isStaff = (interaction) => Boolean(interaction.member?.roles?.cache?.hasAny(...ALL_STAFF_ROLE_IDS));

// Responde com o painel novo: edita a mensagem do clique (ou a resposta já confirmada)
const show = (interaction, components, files) =>
  interaction.deferred || interaction.replied
    ? interaction.editReply({ components, files: files ?? [] })
    : interaction.update({ components, files: files ?? [] });

const warn = (interaction, title, body) =>
  interaction.followUp({ components: ui.noticeView(title, body, 0xed4245), flags: V2 | EPHEMERAL }).catch(() => {});

async function loadDoc(interaction, id) {
  const doc = await store.getSorteio(id);
  if (!doc || doc.guildId !== interaction.guildId) {
    await show(interaction, ui.noticeView("Sorteio não encontrado", "Ele foi apagado ou não pertence a este servidor. Abra /sorteio de novo."));
    return null;
  }
  return doc;
}

async function goHome(interaction, id) {
  const doc = await loadDoc(interaction, id);
  if (doc) await show(interaction, ui.homeView(interaction.guild, doc));
  return doc;
}

// Depois de mexer num sorteio em andamento, a mensagem pública acompanha
async function save(interaction, id, patch) {
  const doc = await store.updateSorteio(id, patch);
  if (doc?.status === "active") engine.refreshPublicNow(interaction.client, doc).catch(() => {});
  return doc;
}

// ---------- leitura dos modais ----------

const field = (interaction, id) => {
  try {
    return interaction.fields.getTextInputValue(id).trim();
  } catch {
    return "";
  }
};
const picked = (interaction, id) => {
  try {
    return interaction.fields.getStringSelectValues(id) ?? [];
  } catch {
    return [];
  }
};

async function readImage(interaction, guildId, userId) {
  let file = null;
  try {
    file = interaction.fields.getUploadedFiles("file", false)?.first() ?? null;
  } catch {
    file = null;
  }
  if (file) {
    const res = await saveImage({
      guildId,
      userId,
      file: { url: file.url, name: file.name, contentType: file.contentType, size: file.size },
    });
    return res.error ? { error: res.error } : { source: res.source };
  }
  const link = field(interaction, "link");
  if (/^https?:\/\/\S+$/i.test(link)) return { source: link };
  return { error: "Envie um arquivo de imagem ou informe um link que comece com http." };
}

// ---------- botões ----------

async function handleSorteioButton(interaction) {
  const [, action, id, a, b] = interaction.customId.split(":");
  const { guild, user } = interaction;

  // ----- botões da mensagem pública -----
  if (action === "noop") {
    return interaction.reply({ components: ui.noticeView("Só uma prévia", "Os botões ficam ativos depois que o sorteio for publicado."), flags: V2 | EPHEMERAL });
  }

  if (action === "join") {
    const doc = await store.getSorteio(id);
    if (!doc) return interaction.reply({ components: ui.noticeView("Sorteio indisponível", "Esse sorteio não existe mais."), flags: V2 | EPHEMERAL });
    const member = interaction.member;
    const result = await engine.tryEnter(interaction.client, doc, member);
    if (result.ok) {
      return interaction.reply({
        components: ui.noticeView("Inscrição feita", `Você está dentro de **${doc.prize}**. Boa sorte!`),
        flags: V2 | EPHEMERAL,
      });
    }
    if (result.already) return interaction.reply({ components: ui.leaveView(doc), flags: V2 | EPHEMERAL });
    return interaction.reply({ components: ui.noticeView("Ainda não deu", result.reason, 0xed4245), flags: V2 | EPHEMERAL });
  }

  if (action === "leave") {
    const doc = await store.getSorteio(id);
    if (doc) await engine.leave(interaction.client, doc, user.id);
    return interaction.update({ components: ui.noticeView("Você saiu", "Sua inscrição foi retirada.") });
  }

  if (action === "pl") {
    const doc = await store.getSorteio(id);
    if (!doc) return interaction.reply({ components: ui.noticeView("Sorteio indisponível", "Esse sorteio não existe mais."), flags: V2 | EPHEMERAL });
    const components = ui.inscritosView(doc, a);
    if (interaction.message?.flags?.has(EPHEMERAL)) return interaction.update({ components });
    return interaction.reply({ components, flags: V2 | EPHEMERAL });
  }

  // ----- daqui para baixo: só a equipe -----
  if (!isStaff(interaction)) {
    return interaction.reply({ components: ui.noticeView("Sem permissão", "Só a equipe configura sorteios."), flags: V2 | EPHEMERAL });
  }

  if (action === "list") return show(interaction, ui.listView(guild, await store.listSorteios(guild.id)));

  if (action === "new") return interaction.showModal(modals.newModal());

  // As demais ações precisam do sorteio
  const doc = await loadDoc(interaction, id);
  if (!doc) return;
  const home = () => goHome(interaction, id);
  const entrega = async () => show(interaction, ui.entregaView(guild, await store.getSorteio(id)));
  const homeFresh = async () => ui.homeView(guild, await store.getSorteio(id));
  const blockNo = ui.blockIndex(doc, a);

  switch (action) {
    case "home":
      return show(interaction, ui.homeView(guild, doc));

    case "prev": {
      const built = await buildMessage(doc, { preview: true });
      const components = [];
      if (built.problems.length) components.push(...ui.noticeView("Antes de publicar", built.problems.map((p) => `- ${p}`).join("\n"), 0xfee75c));
      components.push(...built.components);
      return interaction.reply({ components, files: built.files, flags: V2 | EPHEMERAL, allowedMentions: { parse: [] } });
    }

    // ----- prêmio, vencedores e prazo -----
    case "aj":
      return show(interaction, ui.ajustesView(doc));

    case "ajn":
      return interaction.showModal(modals.renameModal(doc));

    case "ajm":
      return interaction.showModal(modals.ajustesModal(doc));

    // ----- requisitos -----
    case "rq":
      return show(interaction, ui.requisitosView(doc));
    case "rqa":
      return show(interaction, ui.atividadeView(doc));
    case "rqp":
      return show(interaction, ui.perfilView(doc));
    case "rqx":
      return show(interaction, ui.extrasView(guild, doc));

    case "rqm": {
      const updated = await save(interaction, id, { "req.monitor": !doc.req.monitor });
      return show(interaction, ui.requisitosView(updated));
    }

    case "rqpp":
      return interaction.showModal(modals.perfilModal(doc));

    case "rqpc":
      return show(interaction, ui.perfilView(await save(interaction, id, { "req.patterns": [] })));

    case "exd": {
      const extras = doc.extras.filter((e) => e.roleId !== a);
      return show(interaction, ui.extrasView(guild, await save(interaction, id, { extras })));
    }

    // ----- como participar, DM -----
    case "en":
      return show(interaction, ui.entregaView(guild, doc));

    case "em": {
      if (doc.status !== "draft") return show(interaction, ui.entregaView(guild, doc));
      await save(interaction, id, { entryMode: doc.entryMode === "reaction" ? "button" : "reaction" });
      return entrega();
    }

    case "emo":
      return interaction.showModal(modals.emojiModal(doc));

    case "pb": {
      const updated = await save(interaction, id, { "partButton.visible": doc.partButton?.visible === false });
      if (a === "h") return show(interaction, ui.entregaView(guild, updated));
      return show(interaction, ui.botaoView(updated, ui.blockIndex(updated, a), "part"));
    }

    case "dm":
      await save(interaction, id, { "dm.enabled": !doc.dm?.enabled });
      return entrega();

    case "dme":
      return interaction.showModal(modals.dmModal(doc));

    case "dmr":
      await save(interaction, id, { "dm.text": "" });
      return entrega();

    // ----- publicar e acompanhar -----
    case "pub": {
      await interaction.deferUpdate();
      const result = await engine.publish(interaction.client, doc);
      await goHome(interaction, id);
      if (result.error) return warn(interaction, "Não consegui publicar", result.error);
      return interaction.followUp({
        components: ui.noticeView("Sorteio no ar", `O sorteio foi publicado em <#${result.doc.channelId}>.\n${result.url}`),
        flags: V2 | EPHEMERAL,
      });
    }

    case "pz":
      if (doc.status !== "active") return show(interaction, ui.homeView(guild, doc));
      return show(interaction, ui.prazoView(doc));

    case "pzx":
      return interaction.showModal(modals.prazoModal(doc));

    case "end":
    case "rr": {
      await interaction.deferUpdate();
      const result = await engine.finish(interaction.client, id, { reroll: action === "rr" });
      await goHome(interaction, id);
      if (result.error) return warn(interaction, "Não foi possível", result.error);
      return;
    }

    case "del":
      return show(interaction, ui.deleteView(doc));

    case "delok": {
      const removed = await store.removeSorteio(id);
      if (removed?.messageId && removed.channelId) {
        const channel = await interaction.client.channels.fetch(removed.channelId).catch(() => null);
        await channel?.messages?.delete(removed.messageId).catch(() => {});
      }
      return show(interaction, ui.listView(guild, await store.listSorteios(guild.id)));
    }

    // ----- editor da mensagem -----
    case "ed":
      return show(interaction, ui.editorView(doc, a));

    case "eda": {
      if (doc.blocks.length >= D.LIMITS.blocks) return show(interaction, ui.editorView(doc, 0));
      const updated = await save(interaction, id, { blocks: [...doc.blocks, { text: "" }] });
      return show(interaction, ui.editorView(updated, updated.blocks.length - 1));
    }

    case "edr": {
      if (doc.blocks.length <= 1) return show(interaction, ui.editorView(doc, 0));
      const gone = doc.blocks[blockNo];
      const blocks = doc.blocks.filter((_, n) => n !== blockNo);
      await dropSources([gone.image, gone.thumb].filter(Boolean)).catch(() => {});
      const updated = await save(interaction, id, { blocks });
      return show(interaction, ui.editorView(updated, Math.min(blockNo, blocks.length - 1)));
    }

    case "ct":
      return show(interaction, ui.conteudoView(doc, blockNo));

    case "cte":
      return interaction.showModal(modals.textoModal(doc, blockNo));

    case "ctr":
      return show(interaction, ui.conteudoView(await save(interaction, id, { [`blocks.${blockNo}.text`]: D.DEFAULT_TEXT }), blockNo));

    case "md":
      return show(interaction, ui.midiaView(doc, blockNo));

    case "mdi":
      return interaction.showModal(modals.imagemModal(doc, blockNo, "i"));

    case "mdt":
      return interaction.showModal(modals.imagemModal(doc, blockNo, "t"));

    case "mdx": {
      const field = doc.blocks[blockNo] && b === "t" ? "thumb" : "image";
      await dropSources([doc.blocks[blockNo]?.[field]].filter(Boolean)).catch(() => {});
      return show(interaction, ui.midiaView(await save(interaction, id, { [`blocks.${blockNo}.${field}`]: null }), blockNo));
    }

    case "ap":
      return show(interaction, ui.aparenciaView(doc, blockNo));

    case "apc":
      return interaction.showModal(modals.hexModal(doc, blockNo));

    case "apw":
      return show(interaction, ui.aparenciaView(await save(interaction, id, { [`blocks.${blockNo}.wide`]: !doc.blocks[blockNo].wide }), blockNo));

    case "it":
      return show(interaction, ui.interacoesView(doc, blockNo));

    case "bt":
      return show(interaction, ui.botaoView(doc, blockNo, b === "part" ? "part" : "main"));

    case "btm":
      return interaction.showModal(modals.botaoModal(doc, blockNo, b === "part" ? "part" : "main"));

    case "btx": {
      const which = b === "part" ? "part" : "main";
      const path = which === "main" ? "mainButton" : "partButton";
      return show(interaction, ui.botaoView(await save(interaction, id, { [`${path}.emoji`]: "" }), blockNo, which));
    }

    default:
      return;
  }
}

// ---------- menus ----------

async function handleSorteioSelect(interaction) {
  const [, action, id, a, b] = interaction.customId.split(":");
  const { guild } = interaction;
  const values = interaction.values ?? [];

  if (!isStaff(interaction)) {
    return interaction.reply({ components: ui.noticeView("Sem permissão", "Só a equipe configura sorteios."), flags: V2 | EPHEMERAL });
  }

  if (action === "open") {
    const doc = await loadDoc(interaction, values[0]);
    if (doc) await show(interaction, ui.homeView(guild, doc));
    return;
  }

  const doc = await loadDoc(interaction, id);
  if (!doc) return;
  const blockNo = ui.blockIndex(doc, a);

  switch (action) {
    case "ch": {
      if (doc.status !== "draft") return show(interaction, ui.homeView(guild, doc));
      const updated = await save(interaction, id, { channelId: values[0] ?? "" });
      return show(interaction, ui.homeView(guild, updated));
    }

    case "ajw":
      return show(interaction, ui.ajustesView(await save(interaction, id, { winners: Number(values[0]) || 1 })));

    case "ajdu": {
      const ms = Number(values[0]);
      if (!Number.isFinite(ms) || ms < D.LIMITS.minDurationMs) return show(interaction, ui.ajustesView(doc));
      return show(interaction, ui.ajustesView(await save(interaction, id, { durationMs: ms })));
    }

    case "rqc":
      return show(interaction, ui.atividadeView(await save(interaction, id, { "req.callMin": Number(values[0]) || 0 })));
    case "rqmsg":
      return show(interaction, ui.atividadeView(await save(interaction, id, { "req.messages": Number(values[0]) || 0 })));
    case "rqi":
      return show(interaction, ui.atividadeView(await save(interaction, id, { "req.invites": Number(values[0]) || 0 })));

    case "rqw":
      return show(interaction, ui.perfilView(await save(interaction, id, { "req.where": values.filter((v) => v in D.WHERE) })));

    case "exa": {
      const roleId = values[0];
      if (!roleId || roleId === guild.id) return show(interaction, ui.extrasView(guild, doc));
      let extras = doc.extras ?? [];
      if (!extras.some((e) => e.roleId === roleId)) {
        if (extras.length >= 25) return show(interaction, ui.extrasView(guild, doc));
        extras = [...extras, { roleId, extra: 1 }];
      }
      const updated = await save(interaction, id, { extras });
      return show(interaction, ui.extraEditView(guild, updated, roleId));
    }

    case "exp":
      return show(interaction, ui.extraEditView(guild, doc, values[0]));

    case "exq": {
      const roleId = a;
      const extras = (doc.extras ?? []).map((e) => (e.roleId === roleId ? { ...e, extra: Number(values[0]) || 1 } : e));
      return show(interaction, ui.extraEditView(guild, await save(interaction, id, { extras }), roleId));
    }

    case "edb":
      return show(interaction, ui.editorView(doc, Number(values[0]) || 0));

    case "apf":
      if (!(values[0] in D.LAYOUTS)) return;
      return show(interaction, ui.aparenciaView(await save(interaction, id, { layout: values[0] }), blockNo));

    case "apk": {
      const color = values[0] === "none" ? null : values[0];
      return show(interaction, ui.aparenciaView(await save(interaction, id, { [`blocks.${blockNo}.color`]: color }), blockNo));
    }

    case "btc": {
      const which = b === "part" ? "part" : "main";
      if (!(values[0] in D.BUTTON_COLORS)) return;
      const path = which === "main" ? "mainButton" : "partButton";
      return show(interaction, ui.botaoView(await save(interaction, id, { [`${path}.style`]: values[0] }), blockNo, which));
    }

    case "btp": {
      if (!(values[0] in D.PLACES)) return;
      return show(interaction, ui.botaoView(await save(interaction, id, { place: values[0] }), blockNo, "main"));
    }

    case "pzs": {
      const ms = Number(values[0]);
      if (!Number.isFinite(ms) || doc.status !== "active") return show(interaction, ui.homeView(guild, doc));
      const updated = await save(interaction, id, { endsAt: new Date(Date.now() + ms) });
      return show(interaction, ui.homeView(guild, updated));
    }

    default:
      return;
  }
}

// ---------- modais ----------

async function handleSorteioModal(interaction) {
  const [, , kind, id, a, b] = interaction.customId.split(":");
  const { guild, user } = interaction;

  if (!isStaff(interaction)) {
    return interaction.reply({ components: ui.noticeView("Sem permissão", "Só a equipe configura sorteios."), flags: V2 | EPHEMERAL });
  }

  // Tempo: o texto livre vale mais que o menu
  const readTime = () => {
    const custom = field(interaction, "custom");
    if (custom) return parseSpan(custom);
    const chosen = Number(picked(interaction, "duration")[0]);
    return Number.isFinite(chosen) && chosen > 0 ? chosen : undefined;
  };
  const badTime = (ms) => ms === null || (ms !== undefined && (ms < D.LIMITS.minDurationMs || ms > D.LIMITS.maxDurationMs));
  const timeProblem = "Tempo inválido. Use algo como 30m, 2h, 3d ou 1d12h (de 1 minuto a 365 dias).";

  if (kind === "new") {
    const ms = readTime();
    if (badTime(ms)) return interaction.reply({ components: ui.noticeView("Não deu certo", timeProblem, 0xed4245), flags: V2 | EPHEMERAL });
    const doc = await store.createDraft({ guildId: guild.id, hostId: user.id, name: field(interaction, "name") || "Sorteio", prize: field(interaction, "prize") });
    const patch = { winners: Number(picked(interaction, "winners")[0]) || 1, durationMs: ms ?? 24 * 3600 * 1000 };
    const updated = await store.updateSorteio(doc._id, patch);
    return show(interaction, ui.homeView(guild, updated));
  }

  const doc = await loadDoc(interaction, id);
  if (!doc) return;
  const blockNo = ui.blockIndex(doc, a);

  switch (kind) {
    case "ren": {
      const name = field(interaction, "name");
      if (!name) return show(interaction, ui.ajustesView(doc));
      return show(interaction, ui.ajustesView(await save(interaction, id, { name })));
    }

    case "aj": {
      const patch = { winners: Number(picked(interaction, "winners")[0]) || doc.winners };
      const prize = field(interaction, "prize");
      if (prize) patch.prize = prize;
      if (doc.status === "draft") {
        const ms = readTime();
        if (badTime(ms)) {
          await show(interaction, ui.ajustesView(doc));
          return warn(interaction, "Tempo inválido", timeProblem);
        }
        if (ms) patch.durationMs = ms;
      }
      return show(interaction, ui.ajustesView(await save(interaction, id, patch)));
    }

    case "pz": {
      const ms = readTime();
      if (doc.status !== "active" || ms === undefined || badTime(ms)) {
        await show(interaction, ui.homeView(guild, doc));
        return warn(interaction, "Prazo não alterado", ms === undefined ? "Escolha um tempo no menu ou digite um." : timeProblem);
      }
      return show(interaction, ui.homeView(guild, await save(interaction, id, { endsAt: new Date(Date.now() + ms) })));
    }

    case "pf": {
      const patterns = [...new Set(field(interaction, "patterns").split(/[,\n]/).map((p) => p.trim()).filter(Boolean))].map((p) => p.slice(0, 60)).slice(0, 10);
      const where = picked(interaction, "where").filter((v) => v in D.WHERE);
      return show(interaction, ui.perfilView(await save(interaction, id, { "req.patterns": patterns, "req.where": where })));
    }

    case "dm": {
      const text = field(interaction, "text");
      return show(interaction, ui.entregaView(guild, await save(interaction, id, { "dm.text": text === D.DEFAULT_DM ? "" : text })));
    }

    case "tx":
      return show(interaction, ui.conteudoView(await save(interaction, id, { [`blocks.${blockNo}.text`]: field(interaction, "text") }), blockNo));

    case "im": {
      await interaction.deferUpdate(); // baixar a imagem pode levar alguns segundos
      const prop = b === "t" ? "thumb" : "image";
      const res = await readImage(interaction, guild.id, user.id);
      if (res.error) {
        await show(interaction, ui.midiaView(doc, blockNo));
        return warn(interaction, "Imagem não salva", res.error);
      }
      await dropSources([doc.blocks[blockNo]?.[prop]].filter(Boolean)).catch(() => {});
      return show(interaction, ui.midiaView(await save(interaction, id, { [`blocks.${blockNo}.${prop}`]: res.source }), blockNo));
    }

    case "hx": {
      const hex = parseHex(field(interaction, "hex"));
      if (!hex) {
        await show(interaction, ui.aparenciaView(doc, blockNo));
        return warn(interaction, "Cor inválida", "Use #RRGGBB ou #RGB. Exemplo: #7C5CFF");
      }
      return show(interaction, ui.aparenciaView(await save(interaction, id, { [`blocks.${blockNo}.color`]: hex }), blockNo));
    }

    case "bt": {
      const which = b === "part" ? "part" : "main";
      const path = which === "main" ? "mainButton" : "partButton";
      const emoji = field(interaction, "emoji");
      if (emoji && !parseEmoji(emoji).value) {
        await show(interaction, ui.botaoView(doc, blockNo, which));
        return warn(interaction, "Emoji não reconhecido", "Informe um único emoji, normal ou personalizado.");
      }
      const color = picked(interaction, "color")[0];
      const patch = { [`${path}.label`]: field(interaction, "label"), [`${path}.emoji`]: emoji };
      if (color in D.BUTTON_COLORS) patch[`${path}.style`] = color;
      if (which === "main") {
        const place = picked(interaction, "place")[0];
        if (place in D.PLACES) patch.place = place;
      } else {
        patch["partButton.visible"] = picked(interaction, "visible")[0] !== "no";
      }
      return show(interaction, ui.botaoView(await save(interaction, id, patch), blockNo, which));
    }

    case "em": {
      const emoji = field(interaction, "emoji");
      if (!parseEmoji(emoji).value) {
        await show(interaction, ui.entregaView(guild, doc));
        return warn(interaction, "Emoji não reconhecido", "Informe um único emoji, normal ou personalizado.");
      }
      return show(interaction, ui.entregaView(guild, await save(interaction, id, { reactionEmoji: emoji })));
    }

    default:
      return;
  }
}

module.exports = { handleSorteioButton, handleSorteioSelect, handleSorteioModal };
