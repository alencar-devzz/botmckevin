// Junta eventos parecidos que chegam em sequência (mesmo servidor + mesma chave) numa única embed.
// Cada evento chama add(); passado WINDOW ms sem novidade (ou MAX_WAIT no total), flush recebe tudo de uma vez.
const WINDOW = 3000;
const MAX_WAIT = 12000;

const buckets = new Map(); // key -> { items, timer, started, flush }

function add(key, item, flush, { window = WINDOW, maxWait = MAX_WAIT } = {}) {
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { items: [], timer: null, started: Date.now(), flush };
    buckets.set(key, bucket);
  }
  bucket.items.push(item);
  clearTimeout(bucket.timer);

  const left = Math.max(0, maxWait - (Date.now() - bucket.started));
  bucket.timer = setTimeout(() => run(key), Math.min(window, left));
}

async function run(key) {
  const bucket = buckets.get(key);
  if (!bucket) return;
  buckets.delete(key);
  try {
    await bucket.flush(bucket.items);
  } catch (err) {
    console.error("[LOGS] Erro ao enviar log agrupado:", err);
  }
}

// Lista curta: mostra até `max` itens e "+N"
function listLimited(lines, max = 15) {
  if (lines.length <= max) return lines;
  return [...lines.slice(0, max), `… e mais ${lines.length - max}`];
}

module.exports = { add, listLimited };
