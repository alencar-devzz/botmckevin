const { EmbedBuilder } = require("discord.js");
const { DEFAULT_COLOR, MESSAGE_DEFAULTS } = require("./defaults");

// "2 hrs", "1 hr 30 min", "45 min", "1 dia"
function formatInterval(minutes) {
  if (minutes % 1440 === 0) {
    const d = minutes / 1440;
    return `${d} ${d === 1 ? "dia" : "dias"}`;
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  const hours = `${h} ${h === 1 ? "hr" : "hrs"}`;
  return m ? `${hours} ${m} min` : hours;
}

const unix = (date) => Math.floor(date.getTime() / 1000);
const stamp = (date, style) => `<t:${unix(date)}:${style}>`;

const isUrl = (value) => /^https?:\/\/\S+$/i.test(value ?? "");

function parseColor(value) {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(value ?? "").trim());
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join("");
  return parseInt(hex, 16);
}

// Troca as {variáveis}. Variável desconhecida fica como o usuário digitou.
function fill(template, vars) {
  return String(template ?? "").replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match
  );
}

/**
 * Monta a mensagem (lembrete ou agradecimento) a partir da configuração.
 *
 * ctx = {
 *   guild, channelId, now: Date, nextAt: Date, lastBumpAt?: Date, total: number,
 *   user: { id, name } | null,   // quem aparece em {user} (e é marcado automaticamente)
 *   pingUser: boolean,           // marca a pessoa automaticamente no início da mensagem
 *   pingRoles: boolean,          // marca os cargos automaticamente no início da mensagem
 * }
 */
function buildBumpMessage(kind, cfg, ctx) {
  const msg = cfg[kind];
  const defaults = MESSAGE_DEFAULTS[kind];

  const roleMentions = cfg.mentionRoles.map((id) => `<@&${id}>`).join(" ");
  const vars = {
    user: ctx.user ? `<@${ctx.user.id}>` : "",
    user_name: ctx.user?.name ?? "",
    roles: roleMentions,
    interval: formatInterval(cfg.intervalMinutes),
    next: stamp(ctx.nextAt, "R"),
    next_time: stamp(ctx.nextAt, "t"),
    next_date: stamp(ctx.nextAt, "f"),
    last_bump: ctx.lastBumpAt ? stamp(ctx.lastBumpAt, "R") : "",
    server: ctx.guild?.name ?? "",
    channel: ctx.channelId ? `<#${ctx.channelId}>` : "",
    total: String(ctx.total ?? 0),
  };

  // Campos de texto que podem ter variáveis
  const raw = {
    text: msg.text,
    embedTitle: msg.embedTitle,
    embedDescription: msg.embedDescription,
    embedFooter: msg.embedFooter,
    embedAuthor: msg.embedAuthor,
  };
  const used = (name) =>
    Object.entries(raw).some(
      ([key, value]) =>
        (msg.mode === "text" ? key === "text" : key !== "text") && String(value).includes(`{${name}}`)
    );

  // Marcações automáticas ficam numa linha no topo (fora da embed, para notificar de verdade)
  const pings = [];
  if (ctx.pingRoles && roleMentions && !used("roles")) pings.push(roleMentions);
  if (ctx.pingUser && ctx.user && !used("user")) pings.push(`<@${ctx.user.id}>`);

  const f = (value) => fill(value, vars);
  const payload = {
    allowedMentions: {
      parse: [],
      users: ctx.user ? [ctx.user.id] : [],
      roles: cfg.mentionRoles.slice(0, 100),
    },
  };

  if (msg.mode === "embed") {
    const embed = new EmbedBuilder().setColor(parseColor(msg.embedColor) ?? parseColor(DEFAULT_COLOR));

    const title = f(msg.embedTitle).slice(0, 256);
    const description = f(msg.embedDescription).slice(0, 4096);
    if (title) embed.setTitle(title);
    if (title && isUrl(msg.embedUrl)) embed.setURL(msg.embedUrl);
    if (description) embed.setDescription(description);

    const author = f(msg.embedAuthor).slice(0, 256);
    if (author) {
      embed.setAuthor({
        name: author,
        ...(isUrl(msg.embedAuthorIcon) ? { iconURL: msg.embedAuthorIcon } : {}),
      });
    }

    const footer = f(msg.embedFooter).slice(0, 2048);
    if (footer) {
      embed.setFooter({
        text: footer,
        ...(isUrl(msg.embedFooterIcon) ? { iconURL: msg.embedFooterIcon } : {}),
      });
    }

    if (isUrl(msg.embedThumbnail)) embed.setThumbnail(msg.embedThumbnail);
    if (isUrl(msg.embedImage)) embed.setImage(msg.embedImage);
    if (msg.embedTimestamp) embed.setTimestamp(ctx.now);

    // Embed vazia o Discord recusa: cai no texto padrão
    const d = embed.data;
    if (!d.title && !d.description && !d.author && !d.footer && !d.image && !d.thumbnail) {
      embed.setDescription(fill(defaults.embedDescription, vars));
    }

    payload.embeds = [embed];
    if (pings.length) payload.content = pings.join(" ").slice(0, 2000);
  } else {
    const body = f(msg.text).trim();
    const content = [pings.join(" "), body].filter(Boolean).join("\n").slice(0, 2000);
    // Mensagem totalmente vazia o Discord recusa: cai no texto padrão
    payload.content = content || fill(defaults.text, vars).slice(0, 2000);
  }

  return payload;
}

module.exports = { buildBumpMessage, formatInterval, parseColor, isUrl };
