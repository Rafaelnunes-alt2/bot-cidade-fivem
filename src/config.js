// feito por: maquinzz
require('dotenv').config();

function loadEnv() {
  const token = (process.env.TOKEN || '').trim();
  const clientId = (process.env.CLIENT_ID || '').trim();
  const guildId = (process.env.GUILD_ID || '').trim();
  const secret = process.env.SECRET_KEY || '';
  const missing = [];
  if (!token) missing.push('TOKEN');
  if (!clientId) missing.push('CLIENT_ID');
  if (!secret || secret.length < 32) missing.push('SECRET_KEY(32+ chars)');
  if (missing.length > 0) {
    throw new Error('Variaveis de ambiente faltando ou invalidas: ' + missing.join(', ') + '. Copie .env.example para .env e preencha.');
  }
  return { token, clientId, guildId: guildId || null };
}

module.exports = { loadEnv };
