// feito por: maquinzz
const crypto = require('crypto');

function getKey() {
  const raw = process.env.SECRET_KEY || '';
  if (raw.length < 32) throw new Error('SECRET_KEY invalida. Defina uma chave com no minimo 32 caracteres no .env');
  return crypto.createHash('sha256').update(raw).digest();
}

function encrypt(plainText) {
  if (plainText === null || plainText === undefined) return null;
  const text = String(plainText);
  if (text.length === 0) return null;
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(payload) {
  if (!payload) return null;
  const key = getKey();
  const buf = Buffer.from(String(payload), 'base64');
  if (buf.length < 28) throw new Error('Payload criptografado invalido');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString('utf8');
}

function isEncrypted(value) {
  if (!value || typeof value !== 'string') return false;
  if (!value.startsWith('ENC:')) return false;
  try {
    decrypt(value.slice(4));
    return true;
  } catch {
    return false;
  }
}

function wrapEncrypted(plainText) {
  const enc = encrypt(plainText);
  if (!enc) return null;
  return 'ENC:' + enc;
}

function unwrapEncrypted(stored) {
  if (!stored) return null;
  if (typeof stored !== 'string') return null;
  if (stored.startsWith('ENC:')) return decrypt(stored.slice(4));
  return stored;
}

function unwrapSafe(stored) {
  try {
    return unwrapEncrypted(stored);
  } catch {
    return null;
  }
}

module.exports = { encrypt, decrypt, wrapEncrypted, unwrapEncrypted, unwrapSafe, isEncrypted };
