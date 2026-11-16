const { TextInputStyle } = require("discord.js");
const { textLabel, selectLabel, uploadLabel, modal } = require("./modalHelpers");
const D = require("../utils/sorteio/defaults");

// Modais do /sorteio. IDs: "sr:m:<tipo>:<sorteio>[:<bloco>[:<qual>]]"
// Estilo: poucos campos por janela, com menus de escolha dentro do próprio modal.

const winnerOptions = (current) => {
  const list = D.WINNER_OPTIONS.includes(current) ? D.WINNER_OPTIONS : [...D.WINNER_OPTIONS, current].sort((a, b) => a - b);
  return list.map((n) => ({ label: `${n} vencedor${n === 1 ? "" : "es"}`, value: String(n), default: n === current }));
};

const durationOptions = (current) => D.DURATION_OPTIONS.map((o) => ({ label: o.label, value: String(o.ms), default: o.ms === current }));

const TIME_HELP = "Use 30m, 2h, 3d, 1w ou 1d12h. Se preencher, vale no lugar do menu acima.";

function newModal() {
  return modal(
    "sr:m:new",
    "Abrir um sorteio",
    textLabel({ id: "name", label: "Apelido do sorteio", description: "Só você vê. Serve para achar na lista.", max: D.LIMITS.name, required: true, placeholder: "Nitro de sábado" }),
    textLabel({ id: "prize", label: "O que será sorteado", description: "Pode deixar para depois.", max: D.LIMITS.prize, placeholder: "1 mês de Nitro" }),
    selectLabel({ id: "winners", label: "Número de vencedores", options: winnerOptions(1) }),
    selectLabel({ id: "duration", label: "Tempo no ar", description: "Começa a contar quando você publicar.", options: durationOptions(24 * 3600 * 1000) })
  );
}

function renameModal(doc) {
  return modal(
    `sr:m:ren:${doc._id}`,
    "Trocar o apelido",
    textLabel({ id: "name", label: "Novo apelido", max: D.LIMITS.name, required: true, value: doc.name })
  );
}

function ajustesModal(doc) {
  const fields = [
    textLabel({ id: "prize", label: "Prêmio", max: D.LIMITS.prize, required: true, value: doc.prize, placeholder: "O que as pessoas vão ganhar" }),
    selectLabel({ id: "winners", label: "Vencedores", options: winnerOptions(doc.winners) }),
  ];
  if (doc.status === "draft") {
    fields.push(
      selectLabel({ id: "duration", label: "Tempo no ar", options: durationOptions(doc.durationMs), required: false, min: 0 }),
      textLabel({ id: "custom", label: "Tempo sob medida", description: TIME_HELP, max: 20, placeholder: "1d12h" })
    );
  }
  return modal(`sr:m:aj:${doc._id}`, "Prêmio e prazo", ...fields);
}

function prazoModal(doc) {
  return modal(
    `sr:m:pz:${doc._id}`,
    "Reprogramar o fim",
    selectLabel({ id: "duration", label: "Terminar daqui a", description: "Contado a partir de agora.", options: durationOptions(0), required: false, min: 0 }),
    textLabel({ id: "custom", label: "Ou digite o tempo", description: TIME_HELP, max: 20, placeholder: "6h30m" })
  );
}

function perfilModal(doc) {
  return modal(
    `sr:m:pf:${doc._id}`,
    "Exigência de perfil",
    textLabel({
      id: "patterns",
      label: "Palavras ou links",
      description: "Separe por vírgula. Só o status usa esta lista.",
      style: TextInputStyle.Paragraph,
      max: 500,
      value: (doc.req.patterns ?? []).join(", "),
      placeholder: "discord.gg/meuservidor, /meuserver",
    }),
    selectLabel({
      id: "where",
      label: "Onde procurar",
      description: "Basta bater em um dos marcados.",
      min: 0,
      max: 2,
      required: false,
      options: Object.entries(D.WHERE).map(([value, i]) => ({ label: i.label, description: i.desc, value, default: doc.req.where?.includes(value) })),
    })
  );
}

function dmModal(doc) {
  return modal(
    `sr:m:dm:${doc._id}`,
    "Recado ao vencedor",
    textLabel({
      id: "text",
      label: "Mensagem privada",
      description: "Variáveis: {ganhador} {premio} {sorteio} {servidor} {responsavel} {link}",
      style: TextInputStyle.Paragraph,
      max: D.LIMITS.dm,
      required: true,
      value: doc.dm?.text || D.DEFAULT_DM,
    })
  );
}

function textoModal(doc, b) {
  return modal(
    `sr:m:tx:${doc._id}:${b}`,
    `Texto do bloco ${b + 1}`,
    textLabel({
      id: "text",
      label: "Conteúdo",
      description: "Markdown vale. Variáveis: {premio} {termino} {regras} {resultado} e outras.",
      style: TextInputStyle.Paragraph,
      max: 4000,
      value: doc.blocks[b]?.text,
      placeholder: "Escreva o texto deste bloco",
    })
  );
}

function imagemModal(doc, b, kind) {
  return modal(
    `sr:m:im:${doc._id}:${b}:${kind}`,
    kind === "i" ? "Imagem do bloco" : "Miniatura do bloco",
    uploadLabel({ id: "file", label: "Arquivo", description: "png, jpg, gif ou webp, até 4 MB." }),
    textLabel({ id: "link", label: "Ou um link direto", description: "Usado só se nenhum arquivo for enviado.", max: 500, placeholder: "https://..." })
  );
}

function hexModal(doc, b) {
  return modal(
    `sr:m:hx:${doc._id}:${b}`,
    "Cor da barra",
    textLabel({ id: "hex", label: "Código da cor", description: "#RRGGBB ou #RGB.", max: 7, required: true, placeholder: "#7C5CFF" })
  );
}

function botaoModal(doc, b, which) {
  const main = which === "main";
  const spec = main ? doc.mainButton : doc.partButton;
  const fields = [
    textLabel({
      id: "label",
      label: "Texto",
      description: "Vazio usa o padrão. {participantes} mostra o total.",
      max: 80,
      value: spec.label,
      placeholder: main ? D.DEFAULT_MAIN_LABEL : D.DEFAULT_PART_LABEL,
    }),
    textLabel({ id: "emoji", label: "Emoji", description: "Normal ou personalizado. Vazio = sem emoji.", max: 60, value: spec.emoji }),
    selectLabel({
      id: "color",
      label: "Cor",
      options: Object.entries(D.BUTTON_COLORS).map(([value, label]) => ({ label, value, default: spec.style === value })),
    }),
  ];
  if (main) {
    fields.push(
      selectLabel({
        id: "place",
        label: "Posição dos botões",
        options: Object.entries(D.PLACES).map(([value, p]) => ({ label: p.label, description: p.desc, value, default: doc.place === value })),
      })
    );
  } else {
    fields.push(
      selectLabel({
        id: "visible",
        label: "Aparece na mensagem?",
        options: [
          { label: "Sim", value: "yes", default: spec.visible !== false },
          { label: "Não", value: "no", default: spec.visible === false },
        ],
      })
    );
  }
  return modal(`sr:m:bt:${doc._id}:${b}:${which}`, main ? "Botão de entrada" : "Botão de participantes", ...fields);
}

function emojiModal(doc) {
  return modal(
    `sr:m:em:${doc._id}`,
    "Emoji para entrar",
    textLabel({ id: "emoji", label: "Emoji da reação", description: "Um só. Se for personalizado, o bot precisa estar no servidor dele.", max: 60, required: true, value: doc.reactionEmoji })
  );
}

// ----- mensagem do ganhador -----

const WIN_TEXT = {
  t: { key: "text", title: "Texto: resultado", def: D.DEFAULT_WIN_TEXT },
  r: { key: "textReroll", title: "Texto: novo sorteio", def: D.DEFAULT_WIN_REROLL },
  e: { key: "textEmpty", title: "Texto: sem vencedores", def: D.DEFAULT_WIN_EMPTY },
};

function winTextoModal(doc, which) {
  const spec = WIN_TEXT[which] ?? WIN_TEXT.t;
  return modal(
    `sr:m:wt:${doc._id}:${WIN_TEXT[which] ? which : "t"}`,
    spec.title,
    textLabel({
      id: "text",
      label: "Conteúdo",
      description: "Markdown vale. As variáveis estão na tela anterior.",
      style: TextInputStyle.Paragraph,
      max: D.LIMITS.win,
      required: true,
      value: doc.win?.[spec.key] || spec.def,
    })
  );
}

function winHexModal(doc) {
  return modal(
    `sr:m:wh:${doc._id}`,
    "Cor da barra",
    textLabel({ id: "hex", label: "Código da cor", description: "#RRGGBB ou #RGB.", max: 7, required: true, placeholder: "#57F287" })
  );
}

function winImagemModal(doc, kind) {
  return modal(
    `sr:m:wi:${doc._id}:${kind}`,
    kind === "i" ? "Imagem do ganhador" : "Miniatura do ganhador",
    uploadLabel({ id: "file", label: "Arquivo", description: "png, jpg, gif ou webp, até 4 MB." }),
    textLabel({ id: "link", label: "Ou um link direto", description: "Usado só se nenhum arquivo for enviado.", max: 500, placeholder: "https://..." })
  );
}

function winBotaoModal(doc) {
  const b = doc.win?.button ?? {};
  return modal(
    `sr:m:wb:${doc._id}`,
    "Botão do link",
    textLabel({ id: "label", label: "Texto", description: "Vazio usa o padrão. Aceita as variáveis do texto.", max: 80, value: b.label, placeholder: D.DEFAULT_WIN_BUTTON }),
    textLabel({ id: "emoji", label: "Emoji", description: "Normal ou personalizado. Vazio = sem emoji.", max: 60, value: b.emoji })
  );
}

module.exports = { winTextoModal, winHexModal, winImagemModal, winBotaoModal, newModal, renameModal, ajustesModal, prazoModal, perfilModal, dmModal, textoModal, imagemModal, hexModal, botaoModal, emojiModal };
