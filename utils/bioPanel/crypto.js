const crypto = require("crypto");
const ALG = "aes-256-gcm";

function getKey() {
  const hex = process.env.BIO_ENCRYPT_KEY ?? "";
  if (hex.length !== 64 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(
      "[bio-panel] BIO_ENCRYPT_KEY ausente ou inválida. Gere com:\n  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"\ne adicione ao .env como BIO_ENCRYPT_KEY=<resultado>"
    );
  }
  return Buffer.from(hex, "hex");
}

function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${ct.toString("hex")}`;
}

function decrypt(stored) {
  if (!stored || typeof stored !== "string") return null;
  try {
    const key = getKey();
    const [ivHex, tagHex, ctHex] = stored.split(":");
    if (!ivHex || !tagHex || !ctHex) return null;
    const decipher = crypto.createDecipheriv(ALG, key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return decipher.update(Buffer.from(ctHex, "hex")).toString("utf8") + decipher.final("utf8");
  } catch {
    return null;
  }
}

module.exports = { encrypt, decrypt };
