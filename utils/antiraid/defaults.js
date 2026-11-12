// Valores padrão e listas de opções do Anti-Raid.
// Cada parte nova do sistema acrescenta o seu módulo aqui.

const DEFAULTS = {
  core: {
    enabled: false,
    mode: "test", // "test" = só registra e avisa | "live" = pune de verdade
    punishment: "strip", // none | strip | kick | ban
    actions: ["channelDelete", "roleDelete", "ban", "kick", "webhookCreate"],
    limit: 3, // ações do MESMO tipo dentro da janela
    totalLimit: 0, // ações de tipos diferentes somadas (0 = automático: 1,5x o limite)
    windowSec: 10,
    alertChannelId: null,
    exemptUsers: [],
    exemptRoles: [],
  },
  // Módulos das próximas partes (ainda sem painel)
  massJoin: {
    enabled: false,
    threshold: 10, // entradas dentro da janela
    windowSec: 10,
    signals: ["newAccount", "noAvatar", "similarName"],
    minSignals: 1, // sinais que uma conta precisa ter para ser considerada suspeita
    newAccountDays: 7,
    lockdownLevel: "high", // nível de verificação durante o lockdown
    lockdownMin: 10,
    suspectAction: "timeout", // none | timeout | kick
    volumeLockdown: true, // volume MUITO acima do gatilho já aciona o lockdown, mesmo sem contas suspeitas
    volumeFactor: 2, // "muito acima" = gatilho x este fator
    pauseInvites: true, // durante o lockdown, pausa a criação de convites (incident actions do Discord)
    pauseDms: true, // durante o lockdown, pausa as DMs entre membros do servidor
    pausedUntil: 0, // modo evento: timestamp até quando a análise fica pausada
    alertChannelId: null, // vazio = usa o canal do núcleo
    lockdown: null, // { until, prev, level } enquanto estiver em lockdown
  },
  spam: {
    enabled: false,
    ignoreStaff: true, // ignora quem tem Gerenciar Mensagens
    requireSignal: true, // volume sozinho não pune até chegar ao limite x volumeFactor: antes disso exige um sinal de spam
    volumeFactor: 2, // com "exigir sinal" ligado, volume puro pune a partir de limite x este fator
    includeWebhooks: true, // também analisa mensagens enviadas por webhooks (e apaga o webhook que fizer spam)
    limit: 6,
    windowSec: 5,
    signals: ["duplicates", "mentions", "invites", "links"],
    mentionLimit: 5,
    warnings: 1,
    warnSec: 5,
    timeoutMin: 10,
    deleteMessages: true,
    exemptRoles: [],
    exemptChannels: [],
    exemptUsers: [],
    alertChannelId: null, // vazio = usa o canal do núcleo
  },
  antiLink: {
    enabled: false,
    mode: "invites", // invites = só convites de servidores | all = todos os links | custom = só os tipos escolhidos
    blockTypes: ["invite"], // tipos apagados no modo "custom" (chaves de AL_TYPES)
    allowedTypes: [], // tipos que nunca são apagados, em qualquer modo
    allowedDomains: [], // "dominio.com" ou "dominio.com/caminho"; sempre liberados
    blockedDomains: [], // sempre apagados, mesmo fora do modo escolhido
    allowOwnInvites: true, // convites do próprio servidor passam
    allowedGuilds: [], // [{ id, name }] servidores parceiros: os convites deles passam
    bareDomains: true, // também pega "site.com" escrito sem https://
    wrappers: [], // pares de símbolos configurados no painel, ex.: ["<>", "[]"]: apaga qualquer texto escrito entre eles
    ignoreStaff: true, // ignora quem tem Gerenciar Mensagens
    includeWebhooks: true, // também confere mensagens enviadas por webhooks
    exemptRoles: [],
    exemptChannels: [],
    exemptUsers: [],
    notify: true, // avisa no canal (o aviso some sozinho)
    message: "{user}, não é permitido enviar {tipo} aqui.",
    noticeSec: 8,
    punishment: "none", // chaves de AL_PUNISH
    strikeLimit: 3, // mensagens apagadas dentro da janela até punir
    strikeWindowMin: 10,
    timeoutMin: 10,
    logEnabled: true,
    alertChannelId: null, // vazio = usa o canal do núcleo
  },
  antiBot: {
    mode: "off", // off | all (qualquer bot novo) | unverified (só bots não verificados pelo Discord)
    action: "kick", // o que fazer com o bot barrado: kick | ban
    inviterAction: "none", // punição de quem adicionou o bot (mesmas chaves de PUNISHMENTS)
    allowedBots: [], // bots que sempre podem entrar
    trustedUsers: [], // quem pode adicionar bots sem ser barrado
    trustedRoles: [],
    alertChannelId: null,
  },
  antiAlt: {
    minAgeDays: 0, // 0 = desligado
    response: "kick", // kick | tempban | timeout
    banMin: 30, // duração do banimento temporário
    notifyDm: true, // avisa a pessoa na DM antes de agir
    exemptUsers: [],
    alertChannelId: null,
    pendingUnbans: [], // [{ id, at }] banimentos temporários em andamento
  },
  dangerPerms: {
    enabled: false,
    monitored: ["administrator", "manageGuild", "manageRoles", "manageChannels", "manageWebhooks", "banMembers", "kickMembers"],
    response: "revert",
    guardGrants: true, // também vigia a ENTREGA de cargos que têm permissão monitorada (não só a edição do cargo)
    authorizedUsers: [],
    authorizedRoles: [],
    alertChannelId: null,
  },
  protectedRoles: {
    enabled: false,
    roles: [], // cargos que não podem ser entregues sem autorização
    authorizedRoles: [], // quem tem algum destes cargos pode entregar
    authorizedUsers: [], // pessoas (ou bots) que podem entregar
    punishment: "none", // chaves de PUNISHMENTS (none = só reverter)
    alertChannelId: null,
  },
  movCall: {
    enabled: false,
    actions: ["move", "disconnect"],
    limit: 5,
    windowSec: 10,
    punishment: "none", // none = só avisa
    exemptUsers: [],
    exemptRoles: [],
    alertChannelId: null,
  },
  visual: {
    enabled: false,
    protect: ["name", "icon", "banner"], // chaves de VS_FIELDS que não podem mudar sem autorização
    response: "revert", // chaves de VS_RESPONSES
    authorizedUsers: [],
    authorizedRoles: [],
    alertChannelId: null, // vazio = usa o canal do núcleo
    snapshot: null, // referência salva: { name, description, icon, banner, splash, discoverySplash, savedAt }
  },
  native: {
    alertChannelId: null, // canal de alertas das regras de AutoMod criadas pelo painel
    mentionLimit: 5, // limite da regra de spam de menções
    exemptRoles: [], // cargos isentos das regras de AutoMod criadas pelo painel
  },
};

// Ações que o núcleo consegue monitorar
const CORE_ACTIONS = {
  channelDelete: "Excluir canais",
  channelCreate: "Criar canais",
  roleDelete: "Excluir cargos",
  roleCreate: "Criar cargos",
  ban: "Banir membros",
  kick: "Expulsar membros",
  webhookCreate: "Criar webhooks",
  emojiDelete: "Excluir emojis e figurinhas",
  channelPerms: "Alterar permissões de canais",
  inviteCreate: "Criar convites",
  timeout: "Silenciar membros (timeout)",
};

const CORE_LIMITS = [2, 3, 4, 5, 6, 8, 10, 15];
const CORE_WINDOWS = [5, 10, 15, 20, 30, 60];

const PUNISHMENTS = {
  none: { label: "Nenhuma", desc: "Só avisa no canal de alertas." },
  strip: { label: "Remover todos os cargos", desc: "Tira todos os cargos que o bot consegue remover." },
  kick: { label: "Remover cargos e expulsar", desc: "Tira os cargos e expulsa do servidor." },
  ban: { label: "Banir", desc: "Bane o autor do servidor." },
};

// Lista usada no menu geral. "active" diz se o módulo está ligado.
const MODULES = [
  { key: "core", label: "Núcleo anti-raid", desc: "Exclusões, criações e punições feitas em massa.", built: true, active: (c) => c.core.enabled },
  { key: "massJoin", label: "Entrada em massa", desc: "Detecta ondas de contas entrando juntas.", built: true, active: (c) => c.massJoin.enabled },
  { key: "spam", label: "Anti-spam", desc: "Controle de flood de mensagens.", built: true, active: (c) => c.spam.enabled },
  { key: "antiLink", label: "Anti-link", desc: "Apaga convites de servidores e, se quiser, outros links.", built: true, active: (c) => c.antiLink.enabled },
  { key: "antiBot", label: "Anti-bot", desc: "Controle de bots que entram no servidor.", built: true, active: (c) => c.antiBot.mode !== "off" },
  { key: "antiAlt", label: "Anti-alt", desc: "Idade mínima das contas que entram.", built: true, active: (c) => c.antiAlt.minAgeDays > 0 },
  { key: "dangerPerms", label: "Permissões perigosas", desc: "Vigia permissões administrativas novas.", built: true, active: (c) => c.dangerPerms.enabled },
  { key: "protectedRoles", label: "Cargos protegidos", desc: "Impede entrega de cargos sem autorização.", built: true, active: (c) => c.protectedRoles.enabled },
  { key: "movCall", label: "Mov call", desc: "Limite de mover ou desconectar em massa.", built: true, active: (c) => c.movCall.enabled },
  { key: "visual", label: "Visual do servidor", desc: "Protege nome, ícone e banner.", built: true, active: (c) => c.visual.enabled },
  // info: não liga nem desliga, só aplica ajustes no Discord; por isso não entra na contagem de módulos ligados
  { key: "native", label: "Ajustes do Discord", desc: "Verificação, filtros e opções nativas.", built: true, info: true, status: "configurações do próprio Discord", active: () => false },
];

// ---- Entrada em massa ----
const MJ_THRESHOLDS = [5, 6, 8, 10, 15, 20, 25, 40];
const MJ_WINDOWS = [5, 10, 20, 30, 60];
const MJ_LOCK_MIN = [5, 10, 30, 60, 120, 360];
const MJ_NEWACC_DAYS = [1, 3, 7, 14, 30];
const MJ_PAUSE_MIN = [0, 30, 60, 120, 360];
const MJ_SIGNALS = {
  newAccount: "Conta criada há pouco tempo",
  noAvatar: "Conta sem foto de perfil",
  similarName: "Nomes parecidos entre si",
};
const MJ_LEVELS = {
  high: { label: "Alto", desc: "Só fala quem está no servidor há mais de 10 minutos." },
  veryHigh: { label: "Muito alto", desc: "Exige telefone verificado na conta." },
};
const MJ_SUSPECT_ACTIONS = {
  none: { label: "Só elevar a verificação", desc: "Não pune ninguém, apenas aumenta a barreira." },
  timeout: { label: "Silenciar suspeitos por 1 hora", desc: "Aplica timeout nas contas suspeitas." },
  kick: { label: "Expulsar suspeitos", desc: "Expulsa as contas suspeitas da onda." },
};

// ---- Anti-spam ----
const SPAM_LIMITS = [3, 4, 5, 6, 8, 10, 12];
const SPAM_WINDOWS = [3, 5, 7, 10];
const SPAM_MENTIONS = [3, 5, 8, 10];
const SPAM_WARNINGS = [0, 1, 2, 3];
const SPAM_WARN_SEC = [5, 10, 15, 30];
const SPAM_TIMEOUT_MIN = [1, 5, 10, 30, 60, 180, 1440];
const SPAM_SIGNALS = {
  duplicates: "Mensagens repetidas",
  mentions: "Muitas menções",
  invites: "Convites de outros servidores",
  links: "Vários links",
};

// ---- Anti-link ----
const AL_MODES = {
  invites: { label: "Só convites de servidores", desc: "Apaga apenas divulgação de outros servidores. Os demais links ficam livres." },
  all: { label: "Todos os links", desc: "Apaga qualquer link, menos o que estiver liberado." },
  custom: { label: "Só os tipos que eu escolher", desc: "Apaga apenas os tipos marcados em \"Tipos que apaga\"." },
};
// label aparece no painel; noun entra no aviso ({tipo})
const AL_TYPES = {
  invite: { label: "Convites de servidores", noun: "convites de outros servidores" },
  gift: { label: "Presentes e Nitro", noun: "links de presente" },
  discord: { label: "Outros links do Discord", noun: "links do Discord" },
  youtube: { label: "YouTube", noun: "links do YouTube" },
  twitch: { label: "Twitch", noun: "links da Twitch" },
  social: { label: "Redes sociais", noun: "links de redes sociais" },
  gif: { label: "GIFs (Tenor, Giphy)", noun: "links de GIF" },
  media: { label: "Imagens e vídeos", noun: "links de imagens e vídeos" },
  files: { label: "Arquivos e downloads", noun: "links de download" },
  shortener: { label: "Encurtadores de link", noun: "links encurtados" },
  other: { label: "Sites em geral (outros)", noun: "links" },
};
const AL_PUNISH = {
  none: { label: "Só apagar a mensagem", desc: "Sem punição, mesmo que repita." },
  timeout: { label: "Apagar e silenciar (timeout)", desc: "Aplica timeout quando passar do limite." },
  kick: { label: "Apagar e expulsar", desc: "Expulsa quando passar do limite." },
  ban: { label: "Apagar e banir", desc: "Bane quando passar do limite." },
};
const AL_STRIKES = [1, 2, 3, 5, 10];
const AL_STRIKE_WINDOW = [5, 10, 30, 60, 180];
const AL_TIMEOUT_MIN = [1, 5, 10, 30, 60, 180, 1440];
const AL_MAX_DOMAINS = 60;
const AL_MAX_GUILDS = 20;

// ---- Anti-bot ----
const AB_MODES = {
  off: { label: "Desligado", desc: "Qualquer bot pode entrar." },
  all: { label: "Barrar qualquer bot novo", desc: "Só entra quem estiver na lista ou for adicionado por alguém de confiança." },
  unverified: { label: "Barrar bots não verificados", desc: "Bots verificados pelo Discord passam; os demais são barrados." },
};
const AB_ACTIONS = {
  kick: { label: "Expulsar o bot", desc: "O bot é removido e pode ser adicionado de novo." },
  ban: { label: "Banir o bot", desc: "O bot é banido do servidor." },
};

// ---- Anti-alt ----
const AA_AGES = [0, 1, 3, 7, 14, 30, 60, 90];
const AA_RESPONSES = {
  kick: { label: "Expulsar a conta", desc: "Pode tentar de novo quando a conta tiver a idade pedida." },
  tempban: { label: "Banir temporariamente", desc: "Bane e remove o banimento sozinho depois do tempo escolhido." },
  timeout: { label: "Silenciar até a conta amadurecer", desc: "Timeout pelo tempo que falta, até 28 dias." },
};
const AA_BAN_MIN = [10, 30, 60, 360, 1440];

// ---- Permissões perigosas ----
const DP_PERMS = {
  administrator: { label: "Administrador", flag: "Administrator" },
  manageGuild: { label: "Gerenciar servidor", flag: "ManageGuild" },
  manageRoles: { label: "Gerenciar cargos", flag: "ManageRoles" },
  manageChannels: { label: "Gerenciar canais", flag: "ManageChannels" },
  manageWebhooks: { label: "Gerenciar webhooks", flag: "ManageWebhooks" },
  banMembers: { label: "Banir membros", flag: "BanMembers" },
  kickMembers: { label: "Expulsar membros", flag: "KickMembers" },
  moderateMembers: { label: "Silenciar membros (timeout)", flag: "ModerateMembers" },
  mentionEveryone: { label: "Mencionar @everyone", flag: "MentionEveryone" },
  manageMessages: { label: "Gerenciar mensagens", flag: "ManageMessages" },
  manageExpressions: { label: "Gerenciar emojis e figurinhas", flag: "ManageGuildExpressions" },
};
const DP_RESPONSES = {
  warn: { label: "Somente avisar", desc: "Não desfaz nada e não pune.", revert: false, punish: "none" },
  revert: { label: "Reverter a permissão", desc: "Tira a permissão nova do cargo, sem punir.", revert: true, punish: "none" },
  revertStrip: { label: "Reverter e remover cargos", desc: "Também tira os cargos de quem alterou.", revert: true, punish: "strip" },
  revertKick: { label: "Reverter, remover cargos e expulsar", desc: "Também expulsa quem alterou.", revert: true, punish: "kick" },
  revertBan: { label: "Reverter e banir", desc: "Também bane quem alterou.", revert: true, punish: "ban" },
};

// ---- Mov call ----
const MV_ACTIONS = { move: "Mover membros de call", disconnect: "Desconectar membros de call" };
const MV_LIMITS = [3, 5, 8, 10, 15];
const MV_WINDOWS = [5, 10, 20, 30];

// ---- Visual do servidor ----
const VS_FIELDS = {
  name: "Nome do servidor",
  icon: "Ícone",
  banner: "Banner",
  splash: "Plano de fundo do convite",
  discoverySplash: "Plano de fundo da descoberta",
  description: "Descrição",
  verification: "Nível de verificação",
  contentFilter: "Filtro de conteúdo explícito",
  vanity: "URL personalizada (vanity)",
};
const VS_RESPONSES = {
  warn: { label: "Somente avisar · não reverter", desc: "Não desfaz nada e não pune.", revert: false, punish: "none" },
  revert: { label: "Reverter somente · não punir", desc: "Volta ao que estava salvo, sem punir.", revert: true, punish: "none" },
  revertStrip: { label: "Reverter e remover cargos", desc: "Também tira os cargos de quem alterou.", revert: true, punish: "strip" },
  revertKick: { label: "Reverter, remover cargos e expulsar", desc: "Também expulsa quem alterou.", revert: true, punish: "kick" },
  revertBan: { label: "Reverter e banir", desc: "Também bane quem alterou.", revert: true, punish: "ban" },
};

// ---- Ajustes do Discord ----
const NV_VERIFICATION = {
  0: { label: "Nenhum", desc: "Sem restrições para falar." },
  1: { label: "Baixo", desc: "Exige e-mail verificado na conta." },
  2: { label: "Médio", desc: "Também exige conta criada há mais de 5 minutos." },
  3: { label: "Alto", desc: "Também exige mais de 10 minutos no servidor." },
  4: { label: "Muito alto", desc: "Exige telefone verificado na conta." },
};
const NV_FILTER = {
  0: { label: "Desativado", desc: "Não analisa imagens e links de ninguém." },
  1: { label: "Membros sem cargo", desc: "Analisa só quem não tem nenhum cargo." },
  2: { label: "Todos os membros", desc: "Analisa o conteúdo de todo mundo." },
};
const NV_NOTIFY = {
  0: { label: "Todas as mensagens", desc: "Novos membros são avisados de tudo." },
  1: { label: "Apenas menções", desc: "Novos membros só são avisados quando mencionados." },
};
// Mensagens do canal de sistema. O Discord guarda o contrário (flags de "suprimir"),
// então aqui o valor selecionado significa que a mensagem está LIGADA.
const NV_SYSTEM = {
  joins: { label: "Boas-vindas a novos membros", flag: "SuppressJoinNotifications" },
  boosts: { label: "Avisos de impulso (boost)", flag: "SuppressPremiumSubscriptions" },
  tips: { label: "Dicas de configuração do servidor", flag: "SuppressGuildReminderNotifications" },
  stickers: { label: "Botão de figurinha de boas-vindas", flag: "SuppressJoinNotificationReplies" },
};
const NV_MENTION_LIMITS = [3, 5, 8, 10, 20, 50];
const NV_RULE_PREFIX = "Anti-Raid · ";
const NV_AUTOMOD = {
  mention: { name: `${NV_RULE_PREFIX}spam de menções`, label: "Spam de menções" },
  spam: { name: `${NV_RULE_PREFIX}spam suspeito`, label: "Spam suspeito" },
  invites: { name: `${NV_RULE_PREFIX}convites`, label: "Convites" },
  profanity: { name: `${NV_RULE_PREFIX}palavras ofensivas`, label: "Palavras ofensivas" },
};

const AL_MAX_WRAPPERS = 10;

module.exports = {
  AL_MAX_WRAPPERS,
  AL_MODES,
  AL_TYPES,
  AL_PUNISH,
  AL_STRIKES,
  AL_STRIKE_WINDOW,
  AL_TIMEOUT_MIN,
  AL_MAX_DOMAINS,
  AL_MAX_GUILDS,
  VS_FIELDS,
  VS_RESPONSES,
  NV_VERIFICATION,
  NV_FILTER,
  NV_NOTIFY,
  NV_SYSTEM,
  NV_MENTION_LIMITS,
  NV_RULE_PREFIX,
  NV_AUTOMOD,
  DP_PERMS,
  DP_RESPONSES,
  MV_ACTIONS,
  MV_LIMITS,
  MV_WINDOWS,
  AB_MODES,
  AB_ACTIONS,
  AA_AGES,
  AA_RESPONSES,
  AA_BAN_MIN,
  MJ_THRESHOLDS,
  MJ_WINDOWS,
  MJ_LOCK_MIN,
  MJ_NEWACC_DAYS,
  MJ_PAUSE_MIN,
  MJ_SIGNALS,
  MJ_LEVELS,
  MJ_SUSPECT_ACTIONS,
  SPAM_LIMITS,
  SPAM_WINDOWS,
  SPAM_MENTIONS,
  SPAM_WARNINGS,
  SPAM_WARN_SEC,
  SPAM_TIMEOUT_MIN,
  SPAM_SIGNALS,
  DEFAULTS, CORE_ACTIONS, CORE_LIMITS, CORE_WINDOWS, PUNISHMENTS, MODULES };
