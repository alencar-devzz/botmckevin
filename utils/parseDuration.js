const DURATION_REGEX = /^(\d+)(s|m|h|d|w)$/i;

const UNIT_MS = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

// Limite máximo de timeout aceito pela API do Discord.
const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000; // 28 dias

// Procura, nos argumentos, um token no formato "10s", "5m", "2h", "1d" ou
// "1w" (em qualquer posição do comando). Remove esse token da lista e
// retorna a duração em milissegundos (já limitada ao máximo de 28 dias do
// Discord) junto com os argumentos restantes. Se nenhum token de tempo for
// encontrado, retorna duration: null (o comando decide o padrão a usar).
function extractDuration(args) {
  for (let i = 0; i < args.length; i++) {
    const match = args[i].match(DURATION_REGEX);
    if (match) {
      const amount = Number(match[1]);
      const unit = match[2].toLowerCase();
      let ms = amount * UNIT_MS[unit];
      if (ms > MAX_TIMEOUT_MS) ms = MAX_TIMEOUT_MS;

      const remaining = [...args.slice(0, i), ...args.slice(i + 1)];
      return { duration: ms, args: remaining };
    }
  }

  return { duration: null, args };
}

module.exports = { extractDuration, MAX_TIMEOUT_MS };
