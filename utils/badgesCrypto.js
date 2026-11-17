// Criptografia AES-256-GCM para tokens de conta armazenados no MongoDB.
// Exige a variável de ambiente BADGES_SECRET com exatamente 64 hex chars (32 bytes).
const crypto = require("crypto");

const SECRET = process.env.BADGES_SECRET ?? "";

function getKey() {
  if (SECRET.length !== 64 || !/^[0-9a-fA-F]+$/.test(SECRET)) {
    throw new Error("BADGES_SECRET inválida: deve ter 64 caracteres hexadecimais (32 bytes).");
  }
  return Buffer.from(SECRET, "hex");
}

function encrypt(plaintext) {
  const key = getKey();
  const iv  = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag  = cipher.getAuthTag();
  return JSON.stringify({
    iv:   iv.toString("hex"),
    tag:  tag.toString("hex"),
    data: data.toString("hex"),
  });
}

function decrypt(stored) {
  const key = getKey();
  const { iv, tag, data } = JSON.parse(stored);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return decipher.update(Buffer.from(data, "hex")) + decipher.final("utf8");
}

module.exports = { encrypt, decrypt };
