const {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  LabelBuilder,
} = require("discord.js");
const { canManageRole, formatPermissions, listableRoles, encodeState } = require("../utils/roleManage");

// Painel do comando groles (Components V2, sem cor por padrão; emojis note e member nas informações do cargo).
// Telas: l = lista de cargos da pessoa · d = detalhe de um cargo · h = quem tem o cargo · s = resultados da busca

const text = (content) => new TextDisplayBuilder().setContent(String(content).slice(0, 1500));
const clip = (value, max) => String(value ?? "").slice(0, max);
const custom = (action, state) => `grl:${action}:${encodeState(state)}`;

const btn = (id, label, style = ButtonStyle.Secondary, disabled = false) =>
  new ButtonBuilder()
    .setCustomId(id)
    .setLabel(clip(label, 80) || "-")
    .setStyle(style)
    .setDisabled(disabled);

const row = (...components) => new ActionRowBuilder().addComponents(...components);

// Aviso simples em Components V2 (usado em respostas efêmeras e mensagens que se apagam)
function buildNotice(content) {
  return [new ContainerBuilder().addTextDisplayComponents(text(content))];
}

function fill(template, vars) {
  return String(template ?? "").replace(/\{(executor|target|role|server)\}/gi, (_, key) => vars[key.toLowerCase()] ?? "");
}

function startContainer(cfg) {
  const container = new ContainerBuilder();
  if (Number.isInteger(cfg.color)) container.setAccentColor(cfg.color);
  return container;
}

function resolveThumb({ cfg, guild, executor, target, role, state }) {
  const mode = cfg.thumbnail;
  if (mode === "none") return null;
  if (mode && /^https?:\/\//i.test(mode)) return mode;
  const server = guild.iconURL({ extension: "png", size: 256 });
  if (mode === "server") return server;
  if (state.m === "r") return role?.iconURL({ extension: "png", size: 256 }) ?? server;
  return (target ?? executor).displayAvatarURL({ extension: "png", size: 256 }) ?? server;
}

function describe(ctx) {
  const { cfg, guild, executor, target, role, state } = ctx;
  const vars = {
    executor: `<@${executor.id}>`,
    target: target ? `<@${target.id}>` : "",
    role: role ? `<@&${role.id}>` : "",
    server: guild.name,
  };
  let template = cfg.texts.descRole;
  if (state.m === "r" && !role) {
    template = "lae {executor}, selecione o cargo que você quer gerenciar.";
  } else if (state.m === "u") {
    template = target && target.id === executor.id ? cfg.texts.descSelf : cfg.texts.descOther;
  }
  return fill(template, vars);
}

function addHeader(container, ctx) {
  const title = text(`## ${clip(ctx.cfg.texts.title, 100)}`);
  const desc = text(describe(ctx));
  const thumb = resolveThumb(ctx);
  if (thumb) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(title, desc)
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumb))
    );
  } else {
    container.addTextDisplayComponents(title, desc);
  }
}

function addPicker(container, ctx) {
  container.addActionRowComponents(
    row(
      new UserSelectMenuBuilder()
        .setCustomId(custom("pick", ctx.state))
        .setPlaceholder(clip(ctx.cfg.texts.placeholder, 150) || "Selecione")
        .setMinValues(1)
        .setMaxValues(1)
    )
  );
  container.addSeparatorComponents(new SeparatorBuilder());
}

function addFooter(container, ctx) {
  const footer = ctx.cfg.texts.footer;
  if (!footer) return;
  const vars = { executor: `<@${ctx.executor.id}>`, target: ctx.target ? `<@${ctx.target.id}>` : "", role: ctx.role ? `<@&${ctx.role.id}>` : "", server: ctx.guild.name };
  container.addTextDisplayComponents(text(fill(footer, vars)));
}

function roleEntryText(role) {
  return [`<@&${role.id}>`, `<:member:1570579495746937002> ${role.members.size} membro(s)`, `<:note:1569386865587392602> **Permissões:** ${formatPermissions(role)}`].join("\n");
}

// Botão Remover/Adicionar. "enabledByState" = false quando a ação não faz sentido (já tem / não tem o cargo)
function actionButton({ kind, cfg, role, executor, state, enabledByState = true }) {
  const label = kind === "rem" ? cfg.texts.remove : cfg.texts.add;
  const id = custom(kind, state);
  if (!enabledByState) return btn(id, label, ButtonStyle.Secondary, true);
  if (!canManageRole(cfg, executor, role.id)) return btn(id, cfg.texts.noPerm, ButtonStyle.Secondary, true);
  if (!role.editable) return btn(id, cfg.texts.noBot, ButtonStyle.Secondary, true);
  return btn(id, label, kind === "rem" ? ButtonStyle.Danger : ButtonStyle.Success, false);
}

function paginate(items, page, perPage) {
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const current = Math.min(Math.max(0, page), pages - 1);
  return { pages, page: current, slice: items.slice(current * perPage, (current + 1) * perPage) };
}

function navRow(ctx, state, pages, page, extra = []) {
  const { cfg } = ctx;
  return row(
    btn(custom("pg", { ...state, p: page - 1 }), cfg.texts.back, ButtonStyle.Secondary, page <= 0),
    btn(custom("noop", state), `${page + 1}/${pages}`, ButtonStyle.Secondary, true),
    btn(custom("pg", { ...state, p: page + 1 }), cfg.texts.next, ButtonStyle.Secondary, page >= pages - 1),
    ...extra
  );
}

// ---------- Tela: lista de cargos da pessoa (igual à imagem de referência) ----------

function buildListView(ctx) {
  const { cfg, executor, target, state, items } = ctx;
  const { pages, page, slice } = paginate(items, state.p, cfg.perPage);
  const s = { ...state, v: "l", p: page, x: null };

  const container = startContainer(cfg);
  addHeader(container, ctx);
  addPicker(container, ctx);

  if (!target) {
    container.addTextDisplayComponents(text("Essa pessoa não está mais no servidor. Selecione outra no menu acima."));
    container.addSeparatorComponents(new SeparatorBuilder());
  } else if (!slice.length) {
    container.addTextDisplayComponents(text(cfg.texts.emptyList));
    container.addSeparatorComponents(new SeparatorBuilder());
  }

  const kind = s.f === "d" ? "add" : "rem";
  for (const role of slice) {
    container.addTextDisplayComponents(text(roleEntryText(role)));
    container.addActionRowComponents(
      row(actionButton({ kind, cfg, role, executor, state: { ...s, r: role.id }, enabledByState: true }))
    );
    container.addSeparatorComponents(new SeparatorBuilder());
  }

  container.addActionRowComponents(
    row(
      btn(custom("flt", { ...s, f: s.f === "r" ? "a" : "r", p: 0 }), cfg.texts.removable, s.f === "r" ? ButtonStyle.Primary : ButtonStyle.Secondary),
      btn(custom("flt", { ...s, f: s.f === "d" ? "a" : "d", p: 0 }), cfg.texts.addable, s.f === "d" ? ButtonStyle.Primary : ButtonStyle.Secondary),
      btn(custom("srch", s), cfg.texts.search)
    )
  );
  container.addActionRowComponents(navRow(ctx, s, pages, page));
  addFooter(container, ctx);
  return [container];
}

// ---------- Tela: um cargo (mostra se a pessoa tem e deixa remover/adicionar) ----------

function buildDetailView(ctx) {
  const { cfg, executor, target, role, state } = ctx;
  const s = { ...state, v: "d", x: null };

  const container = startContainer(cfg);
  addHeader(container, ctx);
  addPicker(container, ctx);

  if (!role) {
    container.addTextDisplayComponents(text("Esse cargo não existe mais."));
  } else {
    container.addTextDisplayComponents(text(roleEntryText(role)));

    if (target) {
      const has = target.roles.cache.has(role.id);
      container.addTextDisplayComponents(
        text(`**Membro:** <@${target.id}>\n${has ? "Possui este cargo." : "Não possui este cargo."}`)
      );
      container.addActionRowComponents(
        row(
          actionButton({ kind: "rem", cfg, role, executor, state: s, enabledByState: has }),
          actionButton({ kind: "add", cfg, role, executor, state: s, enabledByState: !has })
        )
      );
    } else {
      container.addTextDisplayComponents(text("-# Selecione alguém no menu acima para ver se a pessoa tem este cargo."));
    }
  }

  container.addSeparatorComponents(new SeparatorBuilder());
  const buttons = [
    btn(custom("hold", { ...s, v: "h", p: 0 }), cfg.texts.holders, ButtonStyle.Secondary, !role),
    btn(custom("srch", s), cfg.texts.search),
  ];
  if (state.m === "u") {
    buttons.push(btn(custom("back", { ...s, v: "l", r: null, p: 0 }), cfg.texts.back));
  }
  container.addActionRowComponents(row(...buttons));
  addFooter(container, ctx);
  return [container];
}

// ---------- Tela: quem tem o cargo ----------

function buildHoldersView(ctx) {
  const { cfg, executor, role, state, holders } = ctx;
  const { pages, page, slice } = paginate(holders, state.p, cfg.perPage);
  const s = { ...state, v: "h", p: page, x: null };

  const container = startContainer(cfg);
  addHeader(container, ctx);
  addPicker(container, ctx);

  if (!role) {
    container.addTextDisplayComponents(text("Esse cargo não existe mais."));
    container.addSeparatorComponents(new SeparatorBuilder());
  } else {
    container.addTextDisplayComponents(text(`**Cargo:** <@&${role.id}> · <:member:1570579495746937002> ${holders.length} membro(s)`));
    container.addSeparatorComponents(new SeparatorBuilder());
    if (!slice.length) {
      container.addTextDisplayComponents(text("Ninguém possui este cargo."));
      container.addSeparatorComponents(new SeparatorBuilder());
    }
    for (const member of slice) {
      container.addTextDisplayComponents(text(`<@${member.id}> · \`${member.user.username}\``));
      container.addActionRowComponents(
        row(actionButton({ kind: "rem", cfg, role, executor, state: { ...s, x: member.id }, enabledByState: true }))
      );
      container.addSeparatorComponents(new SeparatorBuilder());
    }
  }

  container.addActionRowComponents(
    navRow(ctx, s, pages, page, [btn(custom("det", { ...s, v: "d", p: 0 }), cfg.texts.detail)])
  );
  addFooter(container, ctx);
  return [container];
}

// ---------- Tela: vários cargos encontrados na busca ----------

function buildResultsView(ctx) {
  const { cfg, state, results } = ctx;
  const s = { ...state, v: "s", x: null };
  const shown = results.slice(0, 25);

  const container = startContainer(cfg);
  addHeader(container, ctx);
  container.addTextDisplayComponents(
    text(
      `**Resultados da busca:** ${results.length} cargo(s)${
        results.length > shown.length ? ` (mostrando ${shown.length})` : ""
      }`
    )
  );
  container.addActionRowComponents(
    row(
      new StringSelectMenuBuilder()
        .setCustomId(custom("sel", s))
        .setPlaceholder("Selecione o cargo")
        .addOptions(
          shown.map((role) => ({
            label: clip(role.name, 100) || "Cargo",
            description: `${role.members.size} membro(s)`,
            value: role.id,
          }))
        )
    )
  );
  container.addSeparatorComponents(new SeparatorBuilder());

  const buttons = [btn(custom("srch", s), cfg.texts.search)];
  if (state.m === "u") buttons.push(btn(custom("back", { ...s, v: "l", r: null, p: 0 }), cfg.texts.back));
  container.addActionRowComponents(row(...buttons));
  addFooter(container, ctx);
  return [container];
}

// ctx: { cfg, guild, executor, target, role, state, items, holders, results }
function buildRolePanel(ctx) {
  const view = ctx.state.m === "r" && ctx.state.v === "l" ? "d" : ctx.state.v;
  if (view === "s" && ctx.results?.length) return buildResultsView(ctx);
  if (view === "h") return buildHoldersView(ctx);
  if (view === "d" || view === "s") return buildDetailView(ctx);
  return buildListView(ctx);
}

// ---------- Modal do botão Buscar ----------

function buildSearchModal({ guild, state }) {
  const input = new TextInputBuilder()
    .setCustomId("q")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(100)
    .setPlaceholder("Ex.: moderador, mod ou o ID do cargo");

  const nameField = new LabelBuilder()
    .setLabel("Nome ou ID do cargo")
    .setDescription("Digite o nome, o ID ou só um pedaço do nome.")
    .setTextInputComponent(input);

  let pickField;
  if (typeof LabelBuilder.prototype.setRoleSelectMenuComponent === "function") {
    const menu = new RoleSelectMenuBuilder()
      .setCustomId("sel")
      .setPlaceholder("Escolha um cargo na lista")
      .setMinValues(0)
      .setMaxValues(1);
    if (typeof menu.setRequired === "function") menu.setRequired(false);
    pickField = new LabelBuilder()
      .setLabel("Ou selecione o cargo")
      .setDescription("Opcional. Se escolher aqui, o texto acima é ignorado.")
      .setRoleSelectMenuComponent(menu);
  } else {
    // discord.js sem select de cargos em modal: usa um select comum com os 25 cargos mais altos
    const menu = new StringSelectMenuBuilder()
      .setCustomId("sel")
      .setPlaceholder("Escolha um cargo na lista")
      .setMinValues(0)
      .setMaxValues(1)
      .addOptions(
        listableRoles(guild)
          .slice(0, 25)
          .map((role) => ({ label: clip(role.name, 100) || "Cargo", value: role.id }))
      );
    if (typeof menu.setRequired === "function") menu.setRequired(false);
    pickField = new LabelBuilder()
      .setLabel("Ou selecione o cargo")
      .setDescription("Opcional. Se escolher aqui, o texto acima é ignorado.")
      .setStringSelectMenuComponent(menu);
  }

  return new ModalBuilder()
    .setCustomId(`grl_modal:${encodeState(state)}`)
    .setTitle("Buscar cargo")
    .addLabelComponents(nameField, pickField);
}

module.exports = { buildRolePanel, buildSearchModal, buildNotice };
