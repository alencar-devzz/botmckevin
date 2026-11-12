const { MessageFlags, PermissionFlagsBits, ChannelType, AttachmentBuilder } = require("discord.js");
const { ALL_STAFF_ROLE_IDS } = require("../utils/staffRoles");
const store = require("../utils/msgBuilder/store");
const { renderDraft, textLength, totalTextLength, parseEmoji } = require("../utils/msgBuilder/render");
const respond = require("../utils/msgBuilder/response");
const { buildView, buildNotice, VIEWS, NEEDS_REPORT } = require("../ui/mensagemPanels");
const modals = require("../ui/mensagemModals");

const { LIMITS, LAYOUTS, COLORS, BUTTON_STYLES, PLACES, RESPONSE_MODES } = store;
const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL = MessageFlags.Ephemeral;

// Só a equipe (cargos de utils/staffRoles.js) ou quem tem Administrador usa o Criador de mensagens
const canUse = (member) =>
  Boolean(member?.permissions.has(PermissionFlagsBits.Administrator) || member?.roles.cache.hasAny(...ALL_STAFF_ROLE_IDS));

const NAV_VIEWS = new Set(["home", "blocks", "audio", "send"]);
const PART_VIEWS = new Set(["text", "media", "look", "btns"]);
const LINK = /^https?:\/\/\S+$/i;

function selectValues(interaction, id) {
  try {
    return interaction.fields.getStringSelectValues(id) ?? [];
  } catch {
    return [];
  }
}

// Aviso só para quem clicou
async function notice(interaction, content) {
  const payload = { components: buildNotice(content), flags: V2 | EPHEMERAL };
  if (interaction.deferred || interaction.replied) return interaction.followUp(payload).catch(() => {});
  return interaction.reply(payload).catch(() => {});
}

async function guard(interaction) {
  if (canUse(interaction.member)) return true;
  await notice(interaction, "Só a equipe pode usar o Criador de mensagens.");
  return false;
}

// Mostra uma tela do editor (atualiza a mensagem do editor)
async function show(interaction, draft, view, note) {
  const { guild } = interaction;
  const report = NEEDS_REPORT.has(view) ? await renderDraft(draft) : null;
  const components = buildView(view, { guild, draft, report, note });
  if (interaction.deferred || interaction.replied) return interaction.editReply({ components });
  return interaction.update({ components });
}

const load = (interaction) => store.getDraft(interaction.guild.id, interaction.user.id);
const persist = (interaction, draft) => store.saveDraft(interaction.guild.id, interaction.user.id, draft);

// ======================= Prévia e publicação =======================

async function preview(interaction, draft) {
  const report = await renderDraft(draft, { withData: true });
  if (!report.components.length) {
    return notice(
      interaction,
      report.audio ? "Não há bloco com conteúdo para mostrar. Só o áudio seria enviado." : "Ainda não há nada para mostrar. Adicione texto, imagem ou botão em algum bloco."
    );
  }
  if (report.count > LIMITS.components) return notice(interaction, report.problems.join("\n"));
  return interaction.reply({ components: report.components, files: report.files, flags: V2 | EPHEMERAL });
}

async function publish(interaction, draft) {
  const { guild, member, user } = interaction;
  const channel = draft.channelId ? guild.channels.cache.get(draft.channelId) : null;
  if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
    return notice(interaction, "Escolha um canal de texto válido para publicar.");
  }

  const mine = channel.permissionsFor(member);
  if (!mine?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
    return notice(interaction, "Você não tem permissão para enviar mensagens nesse canal.");
  }
  const bot = channel.permissionsFor(guild.members.me);
  if (!bot?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
    return notice(interaction, "Eu não consigo enviar mensagens nesse canal. Confira as minhas permissões.");
  }

  await interaction.deferUpdate(); // baixar os arquivos do banco pode levar alguns segundos
  const report = await renderDraft(draft, { withData: true });
  if (!report.ready) return notice(interaction, report.problems.join("\n"));
  if ((report.files.length || report.audio) && !bot.has(PermissionFlagsBits.AttachFiles)) {
    return notice(interaction, "Eu preciso da permissão Anexar Arquivos nesse canal para enviar imagens e áudio.");
  }

  // Só quem pode mencionar todo mundo faz o bot marcar cargos e @everyone
  const parse = mine.has(PermissionFlagsBits.MentionEveryone) ? ["users", "roles", "everyone"] : ["users"];

  // Guarda uma cópia das respostas dos botões: a mensagem publicada não depende mais do rascunho
  let responseIds = new Map();
  try {
    responseIds = await respond.createPublishedResponses({ guildId: guild.id, channelId: channel.id, userId: user.id, draft });
  } catch (err) {
    console.error("[MENSAGEM] Erro ao guardar respostas dos botões:", err);
    return notice(interaction, "Não consegui guardar as respostas dos botões. Tente publicar de novo.");
  }
  const final = responseIds.size ? await renderDraft(draft, { withData: true, responseIds }) : report;

  let first = null;
  try {
    if (final.components.length) {
      first = await channel.send({ components: final.components, files: final.files, flags: V2, allowedMentions: { parse } });
      await respond.attachResponses(responseIds, first.id);
    }
    if (report.audio?.buffer) {
      await channel.send({
        files: [new AttachmentBuilder(report.audio.buffer, { name: report.audio.name })],
        allowedMentions: { parse: [] },
      });
    }
  } catch (err) {
    console.error("[MENSAGEM] Erro ao publicar:", err);
    if (!first) await respond.discardResponses([...responseIds.values()]).catch(() => {});
    return notice(interaction, `Não consegui publicar. O Discord recusou o envio${first ? " do áudio" : ""}.\n-# ${String(err.message).slice(0, 200)}`);
  }

  return show(
    interaction,
    draft,
    "send",
    `**Publicada** em <#${channel.id}>${first ? `  ·  [abrir mensagem](${first.url})` : ""}\n-# O rascunho continua salvo. Você pode enviá-lo para outro canal ou limpar.`
  );
}

// ======================= Botões =======================

async function handleMessageButton(interaction) {
  const { customId, guild, user } = interaction;

  // Botão decorativo das mensagens publicadas: qualquer pessoa pode clicar e nada acontece
  if (customId.startsWith("msg:deco:")) return interaction.deferUpdate().catch(() => {});

  // Botão com resposta de uma mensagem publicada: qualquer pessoa pode clicar
  if (customId.startsWith("msg:r:")) {
    const resp = await respond.findPublishedResponse(customId.slice("msg:r:".length));
    if (!resp || resp.mode === "none") return notice(interaction, "Essa resposta não está mais disponível.");
    return respond.sendResponse(interaction, resp, { ephemeral: resp.hidden });
  }

  if (!(await guard(interaction))) return;

  // Botão com resposta na prévia: mostra a resposta do rascunho de quem clicou (sempre só para quem clicou)
  if (customId.startsWith("msg:pv:")) {
    const [, , bi, bt] = customId.split(":");
    const mine = await load(interaction);
    const clicked = mine.blocks[Number(bi)]?.buttons[Number(bt)];
    if (!clicked || !store.hasResponse(clicked)) return notice(interaction, "Esse botão não tem resposta no seu rascunho.");
    return respond.sendResponse(interaction, clicked.response, { ephemeral: true });
  }

  // Botão da mensagem pública do comando: abre o editor só para quem clicou
  if (customId === "msg:open") {
    const draft = await store.getDraft(guild.id, user.id);
    const report = await renderDraft(draft);
    return interaction.reply({ components: buildView("home", { guild, draft, report }), flags: V2 | EPHEMERAL });
  }

  if (customId === "msg:close") {
    return interaction.update({
      components: buildNotice("Editor fechado. Seu rascunho continua salvo; abra de novo pelo botão da mensagem do painel."),
    });
  }

  const draft = await load(interaction);
  const block = draft.blocks[draft.cursor];
  const parts = customId.split(":"); // msg:<área>:<ação>[:<extra>]

  if (parts[1] === "go") {
    const view = parts[2];
    if (!VIEWS[view] || view === "reset") return;
    return show(interaction, draft, view);
  }

  if (customId === "msg:prev") return preview(interaction, draft);

  // ----- blocos -----
  if (parts[1] === "blk") {
    switch (parts[2]) {
      case "add":
        if (draft.blocks.length >= LIMITS.blocks) return notice(interaction, `O limite é de ${LIMITS.blocks} blocos por mensagem.`);
        draft.blocks.push(store.newBlock());
        draft.cursor = draft.blocks.length - 1;
        break;
      case "del":
        await store.dropSources(store.blockSources(block));
        if (draft.blocks.length > 1) {
          draft.blocks.splice(draft.cursor, 1);
          draft.cursor = Math.min(draft.cursor, draft.blocks.length - 1);
        } else {
          draft.blocks[0] = store.newBlock();
        }
        break;
      case "up":
      case "down": {
        const to = parts[2] === "up" ? draft.cursor - 1 : draft.cursor + 1;
        if (to < 0 || to >= draft.blocks.length) return show(interaction, draft, "blocks");
        [draft.blocks[draft.cursor], draft.blocks[to]] = [draft.blocks[to], draft.blocks[draft.cursor]];
        draft.cursor = to;
        break;
      }
      case "prev":
      case "next": {
        // continua na mesma parte (texto, mídia...) ao trocar de bloco
        const to = parts[2] === "prev" ? draft.cursor - 1 : draft.cursor + 1;
        if (to >= 0 && to < draft.blocks.length) draft.cursor = to;
        const saved = await persist(interaction, draft);
        return show(interaction, saved, PART_VIEWS.has(parts[3]) ? parts[3] : "blocks");
      }
      default:
        return;
    }
    return show(interaction, await persist(interaction, draft), "blocks");
  }

  // ----- texto -----
  if (customId === "msg:txt:edit") {
    const others = totalTextLength(draft.blocks) - textLength(block.text);
    if (others >= LIMITS.textTotal) {
      return notice(interaction, `Os outros blocos já usam os ${LIMITS.textTotal} caracteres permitidos. Encurte algum deles primeiro.`);
    }
    // os marcadores [separador] não contam como texto, então entram na folga do campo
    const overhead = block.text.length - textLength(block.text);
    const max = Math.min(LIMITS.textTotal, Math.max(1, LIMITS.textTotal - others + overhead));
    return interaction.showModal(modals.buildTextModal(block, max));
  }
  if (customId === "msg:txt:clear") {
    block.text = "";
    return show(interaction, await persist(interaction, draft), "text");
  }

  // ----- mídia -----
  if (customId === "msg:med:main") return interaction.showModal(modals.buildImageModal("main"));
  if (customId === "msg:med:thumb") return interaction.showModal(modals.buildImageModal("thumb"));
  if (customId === "msg:med:xmain" || customId === "msg:med:xthumb") {
    const field = customId === "msg:med:xmain" ? "image" : "thumb";
    await store.dropSources([block[field]]);
    block[field] = null;
    return show(interaction, await persist(interaction, draft), "media");
  }

  // ----- aparência -----
  if (customId === "msg:look:hex") return interaction.showModal(modals.buildHexModal(block.color));
  if (customId === "msg:look:wide") {
    block.wide = !block.wide;
    return show(interaction, await persist(interaction, draft), "look");
  }

  // ----- botões -----
  if (parts[1] === "btn") {
    if (parts[2] === "add") {
      if (block.buttons.length >= LIMITS.buttons) return notice(interaction, `O limite é de ${LIMITS.buttons} botões por bloco.`);
      return interaction.showModal(modals.buildButtonModal("new"));
    }
    const index = Number(parts[3]);
    if (!block.buttons[index]) return show(interaction, draft, "btns");
    if (parts[2] === "edit") return interaction.showModal(modals.buildButtonModal(index, block.buttons[index]));
    if (parts[2] === "resp") {
      draft.btnCursor = index;
      return show(interaction, await persist(interaction, draft), "resp");
    }
    if (parts[2] === "del") {
      await store.dropSources(store.buttonSources(block.buttons[index]));
      block.buttons.splice(index, 1);
      return show(interaction, await persist(interaction, draft), "btns");
    }
    return;
  }

  // ----- resposta do botão em edição -----
  if (parts[1] === "rsp" || parts[1] === "rbtn") {
    const target = block.buttons[draft.btnCursor];
    if (!target || target.url) return show(interaction, draft, "btns");
    const resp = target.response;
    const action = parts[2];

    if (parts[1] === "rsp") {
      switch (action) {
        case "prev":
          return respond.sendResponse(interaction, resp, { ephemeral: true });
        case "hidden":
          resp.hidden = !resp.hidden;
          return show(interaction, await persist(interaction, draft), "resp");
        case "txt":
          return interaction.showModal(modals.buildResponseTextModal(resp));
        case "xtxt":
          resp.text = "";
          resp.title = "";
          resp.footer = "";
          return show(interaction, await persist(interaction, draft), "resp");
        case "img":
          return interaction.showModal(modals.buildImageModal("rimg"));
        case "thumb":
          return interaction.showModal(modals.buildImageModal("rthumb"));
        case "ximg":
        case "xthumb": {
          const field = action === "ximg" ? "image" : "thumb";
          await store.dropSources([resp[field]]);
          resp[field] = null;
          return show(interaction, await persist(interaction, draft), "resp");
        }
        case "hex":
          return interaction.showModal(modals.buildHexModal(resp.color, "rhex"));
        default:
          return;
      }
    }

    // botões de link da resposta
    if (action === "add") {
      if (resp.buttons.length >= LIMITS.respButtons) return notice(interaction, `O limite é de ${LIMITS.respButtons} botões por resposta.`);
      return interaction.showModal(modals.buildResponseButtonModal("new"));
    }
    const at = Number(parts[3]);
    if (!resp.buttons[at]) return show(interaction, draft, "rbtns");
    if (action === "edit") return interaction.showModal(modals.buildResponseButtonModal(at, resp.buttons[at]));
    if (action === "del") {
      resp.buttons.splice(at, 1);
      return show(interaction, await persist(interaction, draft), "rbtns");
    }
    return;
  }

  // ----- áudio -----
  if (customId === "msg:aud:set") return interaction.showModal(modals.buildAudioModal());
  if (customId === "msg:aud:clear") {
    await store.dropSources([draft.audio.source]);
    draft.audio = { source: null, name: null };
    return show(interaction, await persist(interaction, draft), "audio");
  }

  // ----- envio -----
  if (customId === "msg:send:go") return publish(interaction, draft);
  if (customId === "msg:send:reset") return show(interaction, draft, "reset");
  if (customId === "msg:send:reset_ok") {
    await store.dropSources(store.draftSources(draft));
    await store.deleteDraft(guild.id, user.id);
    return show(interaction, await load(interaction), "home", "Rascunho limpo. Você começa de novo com um bloco vazio.");
  }
}

// ======================= Selects =======================

async function handleMessageSelect(interaction) {
  if (!(await guard(interaction))) return;
  const { customId, values } = interaction;
  const draft = await load(interaction);
  const block = draft.blocks[draft.cursor];

  switch (customId) {
    case "msg:nav":
      if (!NAV_VIEWS.has(values[0])) return;
      return show(interaction, draft, values[0]);

    case "msg:part":
      if (!PART_VIEWS.has(values[0])) return;
      return show(interaction, draft, values[0]);

    case "msg:blk:pick": {
      const index = Number(values[0]);
      if (!Number.isInteger(index) || index < 0 || index >= draft.blocks.length) return;
      draft.cursor = index;
      return show(interaction, await persist(interaction, draft), "blocks");
    }

    case "msg:look:format":
      if (!(values[0] in LAYOUTS)) return;
      block.layout = values[0];
      return show(interaction, await persist(interaction, draft), "look");

    case "msg:look:color":
      if (values[0] === "none") block.color = null;
      else if (values[0] in COLORS) block.color = values[0];
      else return;
      return show(interaction, await persist(interaction, draft), "look");

    case "msg:rsp:mode": {
      const target = block.buttons[draft.btnCursor];
      if (!target || target.url || !(values[0] in RESPONSE_MODES)) return;
      target.response.mode = values[0];
      return show(interaction, await persist(interaction, draft), "resp");
    }

    case "msg:rsp:color": {
      const target = block.buttons[draft.btnCursor];
      if (!target || target.url) return;
      if (values[0] === "none") target.response.color = null;
      else if (values[0] in COLORS) target.response.color = values[0];
      else return;
      return show(interaction, await persist(interaction, draft), "resp");
    }

    case "msg:send:channel":
      draft.channelId = values[0] ?? null;
      return show(interaction, await persist(interaction, draft), "send");
  }
}

// ======================= Modais =======================

async function handleMessageModal(interaction) {
  if (!(await guard(interaction))) return;
  const key = interaction.customId.slice("msg:modal:".length); // text | main | thumb | hex | btn:<i|new> | audio
  const { guild, user } = interaction;
  const draft = await load(interaction);
  const block = draft.blocks[draft.cursor];
  const field = (id) => interaction.fields.getTextInputValue(id).trim();

  await interaction.deferUpdate(); // baixar arquivos pode demorar

  if (key === "text") {
    const value = field("text");
    const others = totalTextLength(draft.blocks) - textLength(block.text);
    if (others + textLength(value) > LIMITS.textTotal) {
      return notice(interaction, `O texto passa do limite de ${LIMITS.textTotal} caracteres da mensagem inteira.`);
    }
    block.text = value;
    return show(interaction, await persist(interaction, draft), "text");
  }

  if (key === "main" || key === "thumb") {
    const file = interaction.fields.getUploadedFiles("file", false)?.first();
    const link = field("link");

    let source;
    if (file) {
      const saved = await store.saveImage({ guildId: guild.id, userId: user.id, file });
      if (saved.error) return notice(interaction, saved.error);
      source = saved.source;
    } else if (link) {
      if (!LINK.test(link)) return notice(interaction, "Link inválido. Use um link que começa com http:// ou https://");
      source = link;
    } else {
      return notice(interaction, "Envie uma imagem ou informe o link de uma imagem.");
    }

    const target = key === "main" ? "image" : "thumb";
    const old = block[target];
    block[target] = source;
    const saved = await persist(interaction, draft);
    if (old && old !== source) await store.dropSources([old]);
    return show(interaction, saved, "media");
  }

  if (key === "hex") {
    const hex = store.parseHex(field("hex"));
    if (!hex) return notice(interaction, "Cor inválida. Use o formato #RRGGBB ou #RGB.");
    block.color = hex;
    return show(interaction, await persist(interaction, draft), "look");
  }

  // ----- modais da resposta de um botão -----
  if (["rtext", "rimg", "rthumb", "rhex"].includes(key) || key.startsWith("rbtn:")) {
    const target = block.buttons[draft.btnCursor];
    if (!target || target.url) return show(interaction, draft, "btns");
    const resp = target.response;

    if (key === "rtext") {
      const limit = LIMITS.respText[resp.mode] ?? LIMITS.respText.text;
      const value = field("text");
      if (value.length > limit) return notice(interaction, `O texto da resposta passa do limite de ${limit} caracteres.`);
      resp.text = value;
      if (resp.mode === "embed") {
        // título e rodapé só vêm no modal do tipo embed (o tipo pode ter mudado com o modal aberto)
        const optional = (id) => {
          try {
            return field(id);
          } catch {
            return null;
          }
        };
        const title = optional("title");
        const footer = optional("footer");
        if (title !== null) resp.title = title;
        if (footer !== null) resp.footer = footer;
      }
      return show(interaction, await persist(interaction, draft), "resp");
    }

    if (key === "rimg" || key === "rthumb") {
      const file = interaction.fields.getUploadedFiles("file", false)?.first();
      const link = field("link");

      let source;
      if (file) {
        const saved = await store.saveImage({ guildId: guild.id, userId: user.id, file });
        if (saved.error) return notice(interaction, saved.error);
        source = saved.source;
      } else if (link) {
        if (!LINK.test(link)) return notice(interaction, "Link inválido. Use um link que começa com http:// ou https://");
        source = link;
      } else {
        return notice(interaction, "Envie uma imagem ou informe o link de uma imagem.");
      }

      const slot = key === "rimg" ? "image" : "thumb";
      const old = resp[slot];
      resp[slot] = source;
      const saved = await persist(interaction, draft);
      if (old && old !== source) await store.dropSources([old]);
      return show(interaction, saved, "resp");
    }

    if (key === "rhex") {
      const hex = store.parseHex(field("hex"));
      if (!hex) return notice(interaction, "Cor inválida. Use o formato #RRGGBB ou #RGB.");
      resp.color = hex;
      return show(interaction, await persist(interaction, draft), "resp");
    }

    // rbtn:<n|new> — botão de link dentro da resposta
    const which = key.slice("rbtn:".length);
    const label = field("label");
    const url = field("url");
    const emojiRaw = field("emoji");
    if (!LINK.test(url)) return notice(interaction, "Link inválido. Use um link que começa com http:// ou https://");
    const emoji = parseEmoji(emojiRaw);
    if (emoji.error) return notice(interaction, "Emoji inválido. Use um emoji ou o formato <:nome:id> de um emoji do servidor.");
    if (!label && !emoji.value) return notice(interaction, "Informe o texto do botão ou um emoji.");

    const entry = { label, url, emoji: emojiRaw };
    if (which === "new") {
      if (resp.buttons.length >= LIMITS.respButtons) return notice(interaction, `O limite é de ${LIMITS.respButtons} botões por resposta.`);
      resp.buttons.push(entry);
    } else if (resp.buttons[Number(which)]) {
      resp.buttons[Number(which)] = entry;
    } else {
      return show(interaction, draft, "rbtns");
    }
    return show(interaction, await persist(interaction, draft), "rbtns");
  }

  if (key.startsWith("btn:")) {
    const which = key.slice(4); // "new" ou o número do botão
    const label = field("label");
    const url = field("url");
    const emojiRaw = field("emoji");

    if (url && !LINK.test(url)) return notice(interaction, "Link inválido. Use um link que começa com http:// ou https:// (ou deixe vazio para um botão decorativo).");
    const emoji = parseEmoji(emojiRaw);
    if (emoji.error) return notice(interaction, "Emoji inválido. Use um emoji ou o formato <:nome:id> de um emoji do servidor.");
    if (!label && !emoji.value) return notice(interaction, "Informe o texto do botão ou um emoji.");

    const style = selectValues(interaction, "style")[0];
    const place = selectValues(interaction, "place")[0];
    const entry = {
      label,
      url,
      emoji: emojiRaw,
      style: style in BUTTON_STYLES ? style : "secondary",
      place: place in PLACES ? place : "inside",
      // editar o botão não apaga a resposta que ele já tinha
      response: which === "new" ? store.newResponse() : block.buttons[Number(which)]?.response ?? store.newResponse(),
    };

    if (which === "new") {
      if (block.buttons.length >= LIMITS.buttons) return notice(interaction, `O limite é de ${LIMITS.buttons} botões por bloco.`);
      block.buttons.push(entry);
    } else if (block.buttons[Number(which)]) {
      block.buttons[Number(which)] = entry;
    } else {
      return show(interaction, draft, "btns");
    }
    return show(interaction, await persist(interaction, draft), "btns");
  }

  if (key === "audio") {
    const file = interaction.fields.getUploadedFiles("file", true)?.first();
    if (!file) return notice(interaction, "Envie um arquivo de áudio ou vídeo.");
    const saved = await store.saveAudio({ guildId: guild.id, userId: user.id, file });
    if (saved.error) return notice(interaction, saved.error);

    const old = draft.audio.source;
    draft.audio = { source: saved.source, name: saved.name };
    const next = await persist(interaction, draft);
    if (old) await store.dropSources([old]);
    return show(interaction, next, "audio");
  }
}

module.exports = { handleMessageButton, handleMessageSelect, handleMessageModal };
