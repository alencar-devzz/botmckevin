const { ButtonStyle, TextInputStyle, RoleSelectMenuBuilder } = require("discord.js");
const { ui } = require("./antiraid");
const { helpers } = require("./antiraidModules");
const access = require("./antiraidAccess");
const { textLabel, modal } = require("./modalHelpers");
const D = require("../utils/antiraid/defaults");

// Painel do Anti-link (ar:al:*) e os modais das listas.
const { text, btn, row, tag, box, header, toggleBtn, flagBtn } = ui;
const { pickOne, pickMany, nums, alertPick, channelPick } = helpers;
const { userPick } = access.helpers;

const typeLabels = Object.fromEntries(Object.entries(D.AL_TYPES).map(([key, info]) => [key, info.label]));
const typeNames = (keys) => keys.map((k) => D.AL_TYPES[k]?.label).filter(Boolean);
const yesNo = (on) => `\`${on ? "Sim" : "Não"}\``;

// Resume uma lista numa linha: "a, b, c e mais 4"
function brief(list, max = 5) {
  if (!list.length) return "nenhum";
  const shown = list.slice(0, max).map((item) => `\`${String(item).slice(0, 40)}\``);
  return list.length > max ? `${shown.join(", ")} e mais ${list.length - max}` : shown.join(", ");
}

function modeSummary(a) {
  if (a.mode === "all") return "Apaga **todos os links**, menos o que estiver liberado.";
  if (a.mode === "custom") {
    return a.blockTypes.length
      ? `Apaga só: ${typeNames(a.blockTypes).join(", ")}.`
      : "Nenhum tipo marcado: por enquanto só os domínios bloqueados são apagados.";
  }
  return "Apaga só **convites de servidores**. Os outros links ficam livres.";
}

// ======================= Painel principal =======================

function buildAntiLinkPanel(guild, cfg) {
  const a = cfg.antiLink;

  const estado = box()
    .addTextDisplayComponents(
      text(
        [
          "### Proteção",
          "-# Apaga mensagens com links proibidos, também quando a pessoa edita a mensagem para colocar o link depois.",
          `**Anti-link**  ${tag(a.enabled)}`,
          `**Liberar convites do próprio servidor**  ${yesNo(a.allowOwnInvites)}  ·  o bot confere de qual servidor é o convite`,
          `**Pegar domínios sem https://**  ${yesNo(a.bareDomains)}  ·  detecta \`site.com\` e \`discord.gg/abc\` escritos soltos`,
        ].join("\n")
      )
    )
    .addActionRowComponents(
      row(
        toggleBtn("ar:al:toggle", a.enabled),
        flagBtn("ar:al:own", "Convites próprios", a.allowOwnInvites),
        flagBtn("ar:al:bare", "Sem https://", a.bareDomains)
      )
    );

  const modo = box()
    .addTextDisplayComponents(
      text(`### O que apagar\n-# ${modeSummary(a)}\n-# Os tipos só valem no modo "Só os tipos que eu escolher".`)
    )
    .addActionRowComponents(
      pickOne(
        "ar:al:mode",
        "Escolha o modo",
        Object.entries(D.AL_MODES).map(([value, i]) => ({ label: i.label, description: i.desc, value })),
        a.mode
      ),
      pickMany("ar:al:types", "Tipos que apaga", typeLabels, a.blockTypes)
    );

  const liberacoes = box()
    .addTextDisplayComponents(
      text(
        [
          "### Liberações",
          "-# Nunca apagam. A ordem é: domínio liberado, domínio bloqueado, tipo liberado e, por último, o modo.",
          `**Domínios liberados**  ${brief(a.allowedDomains)}`,
          `**Domínios bloqueados**  ${brief(a.blockedDomains)}`,
          `**Servidores parceiros**  ${brief(a.allowedGuilds.map((g) => g.name || g.id))}`,
        ].join("\n")
      )
    )
    .addActionRowComponents(
      pickMany("ar:al:allowtypes", "Tipos sempre liberados", typeLabels, a.allowedTypes),
      row(
        btn("ar:al:domAllow", `Domínios liberados (${a.allowedDomains.length})`),
        btn("ar:al:domBlock", `Domínios bloqueados (${a.blockedDomains.length})`),
        btn("ar:al:guilds", `Servidores parceiros (${a.allowedGuilds.length})`)
      )
    );

  return [
    header("Anti-link", "Anti-link"),
    estado,
    modo,
    liberacoes,
    row(btn("ar:mod:antiLinkResp", "Resposta e exceções", ButtonStyle.Primary), btn("ar:hub", "Voltar")),
  ];
}

// ======================= Resposta e exceções =======================

function buildAntiLinkResponsePanel(guild, cfg) {
  const a = cfg.antiLink;
  const punishing = a.punishment !== "none";

  const aviso = box()
    .addTextDisplayComponents(
      text(
        [
          "### Aviso e registro",
          "-# O que aparece depois que a mensagem é apagada.",
          `**Avisar no canal**  ${yesNo(a.notify)}  ·  o aviso some sozinho em ${a.noticeSec}s`,
          `**Registrar no canal de alertas**  ${yesNo(a.logEnabled)}  ·  quem enviou, onde e quais links`,
          `**Ignorar equipe**  ${yesNo(a.ignoreStaff)}  ·  quem tem Gerenciar Mensagens nunca é analisado`,
        ].join("\n")
      )
    )
    .addActionRowComponents(
      row(
        flagBtn("ar:al:notify", "Avisar", a.notify),
        flagBtn("ar:al:log", "Registrar", a.logEnabled),
        flagBtn("ar:al:staff", "Ignorar equipe", a.ignoreStaff)
      )
    );

  const punicao = box()
    .addTextDisplayComponents(
      text(
        `### Punição por repetição\n-# ${
          punishing
            ? `Quando a pessoa tiver **${a.strikeLimit}** mensagem(ns) apagada(s) em **${a.strikeWindowMin} min**.`
            : "Desligada: a mensagem é apagada e mais nada."
        }`
      )
    )
    .addActionRowComponents(
      pickOne(
        "ar:al:punish",
        "Punição",
        Object.entries(D.AL_PUNISH).map(([value, i]) => ({ label: i.label, description: i.desc, value })),
        a.punishment
      ),
      pickOne("ar:al:strikes", "Mensagens apagadas até punir", nums(D.AL_STRIKES, (n) => `${n} mensagem(ns) apagada(s)`), a.strikeLimit),
      pickOne(
        "ar:al:window",
        "Dentro de quanto tempo",
        nums(D.AL_STRIKE_WINDOW, (n) => (n >= 60 ? `em ${n / 60} hora(s)` : `em ${n} minutos`)),
        a.strikeWindowMin
      ),
      pickOne(
        "ar:al:timeout",
        "Duração do timeout",
        nums(D.AL_TIMEOUT_MIN, (n) => (n >= 1440 ? "1 dia" : n >= 60 ? `${n / 60} hora(s)` : `${n} minuto(s)`)),
        a.timeoutMin
      )
    );

  const roles = new RoleSelectMenuBuilder().setCustomId("ar:al:xroles").setPlaceholder("Cargos isentos").setMinValues(0).setMaxValues(25);
  const validRoles = a.exemptRoles.filter((id) => guild.roles.cache.has(id)).slice(0, 25);
  if (validRoles.length) roles.setDefaultRoles(...validRoles);

  const isentos = box()
    .addTextDisplayComponents(text("### Exceções\n-# Cargos, canais (ou categorias) e pessoas que o Anti-link ignora. O dono do servidor já é isento."))
    .addActionRowComponents(
      row(roles),
      channelPick("ar:al:xchannels", "Canais isentos (ou categorias)", guild, a.exemptChannels, 25),
      userPick("ar:al:xusers", "Pessoas isentas", a.exemptUsers)
    );

  const alertas = box()
    .addTextDisplayComponents(text("### Canal de alertas\n-# Vazio usa o canal do núcleo."))
    .addActionRowComponents(alertPick("ar:al:alert", guild, a.alertChannelId));

  return [
    header("Anti-link · resposta e exceções", "Anti-link › Resposta"),
    aviso,
    punicao,
    isentos,
    alertas,
    row(btn("ar:al:msg", "Editar mensagem do aviso", ButtonStyle.Primary), btn("ar:mod:antiLink", "Voltar")),
  ];
}

// ======================= Modais =======================

const DOMAIN_MODALS = {
  allow: {
    title: "Domínios liberados",
    label: "Domínios que nunca apagam",
    description: "Um por linha. Ex.: youtube.com ou discord.gg/meuservidor",
    placeholder: "youtube.com\nmeusite.com.br\ndiscord.gg/meuservidor",
  },
  block: {
    title: "Domínios bloqueados",
    label: "Domínios que sempre apagam",
    description: "Um por linha. Apaga mesmo fora do modo escolhido.",
    placeholder: "site-ruim.com\nencurtador.xyz",
  },
};

function buildDomainModal(kind, current) {
  const info = DOMAIN_MODALS[kind];
  return modal(
    `ar:al:modal:${kind}`,
    info.title,
    textLabel({
      id: "list",
      label: info.label,
      description: info.description,
      style: TextInputStyle.Paragraph,
      max: 4000,
      required: false,
      value: current.join("\n"),
      placeholder: info.placeholder,
    })
  );
}

const cleanName = (name) => String(name ?? "").replace(/[\r\n#]/g, " ").trim();

function buildGuildsModal(current) {
  return modal(
    "ar:al:modal:guilds",
    "Servidores parceiros",
    textLabel({
      id: "list",
      label: "Servidores liberados",
      description: "ID do servidor ou um convite dele, um por linha. Esvazie para remover todos.",
      style: TextInputStyle.Paragraph,
      max: 4000,
      required: false,
      value: current.map((g) => (g.name ? `${g.id} # ${cleanName(g.name)}` : g.id)).join("\n"),
      placeholder: "123456789012345678\ndiscord.gg/servidor-parceiro",
    })
  );
}

function buildMessageModal(current) {
  return modal(
    "ar:al:modal:msg",
    "Mensagem do aviso",
    textLabel({
      id: "message",
      label: "Texto do aviso",
      description: "Use {user} para mencionar a pessoa e {tipo} para o tipo de link.",
      style: TextInputStyle.Paragraph,
      max: 300,
      required: true,
      value: current,
      placeholder: D.DEFAULTS.antiLink.message,
    })
  );
}

module.exports = {
  buildAntiLinkPanel,
  buildAntiLinkResponsePanel,
  buildDomainModal,
  buildGuildsModal,
  buildMessageModal,
};
