const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder,
  TextInputStyle,
} = require("discord.js");
const { addBackButton } = require("./backButton");
const { textLabel, modal } = require("./modalHelpers");

// Painéis do menu: Moderação → Gerenciamento de cargos

const text = (content) => new TextDisplayBuilder().setContent(String(content).slice(0, 3000));
const clip = (value, max) => String(value ?? "").slice(0, max);
const btn = (id, label, style = ButtonStyle.Secondary) =>
  new ButtonBuilder().setCustomId(id).setLabel(clip(label, 80)).setStyle(style);

const MAX_RULES = 25;

function ruleLine(rule) {
  if (!rule.blocked.length) return `<@&${rule.managerId}> — pode gerenciar **todos** os cargos`;
  return `<@&${rule.managerId}> — todos, **exceto**: ${rule.blocked.map((id) => `<@&${id}>`).join(" ")}`;
}

function thumbLabel(value) {
  if (!value) return "automática";
  if (value === "none") return "nenhuma";
  if (value === "server") return "ícone do servidor";
  return "link personalizado";
}

// ---------- Painel principal ----------

function buildRoleManageHome(guild, cfg, prefix) {
  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Gerenciamento de cargos"),
    text(`-# Define quem pode gerenciar quais cargos com o comando \`${prefix}groles\` e como o painel aparece.`),
    text(`-# Comando: **${cfg.enabled ? "ativado" : "desativado"}**${cfg.customRules ? "" : " · usando as regras padrão"}`)
  );

  const rulesText = cfg.rules.length
    ? cfg.rules.map(ruleLine).join("\n")
    : "Nenhuma regra: só o dono do servidor consegue usar o comando.";

  const rules = new ContainerBuilder().addTextDisplayComponents(
    text("**Quem gerencia quem**"),
    text(`-# Cada cargo abaixo pode gerenciar todos os cargos, menos os marcados como bloqueados. Quem tem vários cargos soma as permissões.`),
    text(rulesText)
  );

  if (cfg.rules.length) {
    rules.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("rmcfg_pick")
          .setPlaceholder("Editar a regra de um cargo")
          .addOptions(
            cfg.rules.slice(0, MAX_RULES).map((rule) => ({
              label: clip(guild.roles.cache.get(rule.managerId)?.name ?? "Cargo removido", 100),
              description: rule.blocked.length
                ? `Não gerencia ${rule.blocked.length} cargo(s)`
                : "Gerencia todos os cargos",
              value: rule.managerId,
            }))
          )
      )
    );
  }

  rules
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId("rmcfg_addmgr")
          .setPlaceholder("Adicionar um cargo que pode gerenciar")
          .setMinValues(1)
          .setMaxValues(1)
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        btn("rmcfg_toggle", cfg.enabled ? "Desativar comando" : "Ativar comando", cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
        btn("rmcfg_reset_rules", "Restaurar regras padrão")
      )
    );

  const look = new ContainerBuilder()
    .addTextDisplayComponents(
      text("**Aparência do painel**"),
      text("-# Título, descrições, nome dos botões, cor, miniatura e rodapé."),
      text(
        `-# Cor: ${cfg.color === null ? "sem cor" : `\`#${cfg.color.toString(16).padStart(6, "0")}\``} · Miniatura: ${thumbLabel(cfg.thumbnail)} · Cargos por página: ${cfg.perPage}`
      ),
      text("-# Variáveis nos textos: `{executor}` `{target}` `{role}` `{server}`")
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        btn("rmcfg_edit:texts", "Textos do painel"),
        btn("rmcfg_edit:btn1", "Botões (1/2)"),
        btn("rmcfg_edit:btn2", "Botões (2/2)"),
        btn("rmcfg_edit:other", "Cor e miniatura")
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        btn("rmcfg_perpage", `Cargos por página: ${cfg.perPage}`),
        btn("rmcfg_reset_ui", "Restaurar aparência", ButtonStyle.Danger)
      )
    );
  addBackButton(look, "back_moderacao");

  return [header, rules, look];
}

// ---------- Editor da regra de um cargo ----------

function buildRuleEditor(guild, rule) {
  const blocked = rule.blocked.filter((id) => guild.roles.cache.has(id)).slice(0, 25);

  const header = new ContainerBuilder().addTextDisplayComponents(
    text("### Regra de cargo"),
    text(`**Cargo:** <@&${rule.managerId}>`),
    text(
      blocked.length
        ? `-# Pode gerenciar todos os cargos, **exceto**: ${blocked.map((id) => `<@&${id}>`).join(" ")}`
        : "-# Pode gerenciar **todos** os cargos do servidor."
    )
  );

  const select = new RoleSelectMenuBuilder()
    .setCustomId(`rmcfg_blocked:${rule.managerId}`)
    .setPlaceholder("Cargos que ele NÃO pode gerenciar")
    .setMinValues(0)
    .setMaxValues(25);
  if (blocked.length) select.setDefaultRoles(...blocked);

  const body = new ContainerBuilder()
    .addTextDisplayComponents(
      text("**Cargos bloqueados**"),
      text("-# Quem tem este cargo vê \"Sem permissão\" (desativado) nos cargos escolhidos aqui. Até 25 cargos.")
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(select))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        btn(`rmcfg_clearblocked:${rule.managerId}`, "Liberar todos os cargos"),
        btn(`rmcfg_delrule:${rule.managerId}`, "Remover regra", ButtonStyle.Danger),
        btn("rmcfg_home", "Voltar")
      )
    );

  return [header, body];
}

// ---------- Modais de aparência ----------

const SHORT = TextInputStyle.Short;
const PARAGRAPH = TextInputStyle.Paragraph;
const VARS = "Variáveis: {executor} {target} {role} {server}";

// Campos de cada modal: [chave, rótulo, tamanho máximo, estilo, descrição]
const MODAL_FIELDS = {
  texts: {
    title: "Textos do painel",
    fields: [
      ["title", "Título", 100, SHORT],
      ["descSelf", "Descrição (próprios cargos)", 300, PARAGRAPH, VARS],
      ["descOther", "Descrição (cargos de outra pessoa)", 300, PARAGRAPH, VARS],
      ["descRole", "Descrição (cargo marcado)", 300, PARAGRAPH, VARS],
      ["placeholder", "Texto do select de pessoas", 150, SHORT],
    ],
  },
  btn1: {
    title: "Botões (1/2)",
    fields: [
      ["remove", "Botão Remover", 80, SHORT],
      ["add", "Botão Adicionar", 80, SHORT],
      ["noPerm", "Quando não tem permissão", 80, SHORT, "Aparece no botão desativado."],
      ["noBot", "Quando o cargo está acima do bot", 80, SHORT, "Aparece no botão desativado."],
      ["removable", "Botão Removíveis", 80, SHORT],
    ],
  },
  btn2: {
    title: "Botões (2/2)",
    fields: [
      ["addable", "Botão Adicionáveis", 80, SHORT],
      ["search", "Botão Buscar", 80, SHORT],
      ["back", "Botão Voltar", 80, SHORT],
      ["next", "Botão Avançar", 80, SHORT],
      ["holders", "Botão para ver quem tem o cargo", 80, SHORT],
    ],
  },
};

function buildTextsModal(kind, cfg) {
  const def = MODAL_FIELDS[kind];
  return modal(
    `rmcfg_modal:${kind}`,
    def.title,
    ...def.fields.map(([id, label, max, style, description]) =>
      textLabel({
        id,
        label,
        description: description ?? "Deixe vazio para voltar ao padrão.",
        style,
        max,
        required: false,
        value: cfg.texts[id] || undefined,
      })
    )
  );
}

function buildOtherModal(cfg) {
  const colorNow = cfg.color === null ? undefined : `#${cfg.color.toString(16).padStart(6, "0")}`;
  return modal(
    "rmcfg_modal:other",
    "Cor, miniatura e rodapé",
    textLabel({
      id: "color",
      label: "Cor do painel",
      description: "Ex.: #5865F2. Vazio = sem cor.",
      max: 7,
      required: false,
      value: colorNow,
    }),
    textLabel({
      id: "thumbnail",
      label: "Miniatura",
      description: "Vazio = automática (avatar/ícone). Ou: nenhuma, servidor, ou um link de imagem.",
      max: 300,
      required: false,
      value: cfg.thumbnail && cfg.thumbnail !== "none" && cfg.thumbnail !== "server" ? cfg.thumbnail : undefined,
    }),
    textLabel({
      id: "footer",
      label: "Rodapé",
      description: `${VARS}. Vazio = sem rodapé.`,
      style: PARAGRAPH,
      max: 300,
      required: false,
      value: cfg.texts.footer || undefined,
    }),
    textLabel({
      id: "emptyList",
      label: "Texto quando a lista está vazia",
      description: "Deixe vazio para voltar ao padrão.",
      max: 200,
      required: false,
      value: cfg.texts.emptyList || undefined,
    }),
    textLabel({
      id: "detail",
      label: "Botão para voltar ao cargo",
      description: "Aparece na tela de quem tem o cargo.",
      max: 80,
      required: false,
      value: cfg.texts.detail || undefined,
    })
  );
}

module.exports = {
  buildRoleManageHome,
  buildRuleEditor,
  buildTextsModal,
  buildOtherModal,
  MODAL_FIELDS,
  MAX_RULES,
};
