// feito por: maquinzz
const SQL_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isValidSqlIdent(v) {
  return typeof v === 'string' && SQL_IDENT.test(v) && v.length <= 64;
}

function isValidDbName(v) {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  return s.length >= 1 && s.length <= 64 && /^[A-Za-z0-9_\-]+$/.test(s);
}

function isValidDbUser(v) {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  return s.length >= 1 && s.length <= 64 && /^[A-Za-z0-9_\-@.]+$/.test(s);
}

function isValidHost(v) {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (s.length === 0 || s.length > 255) return false;
  return /^[A-Za-z0-9.\-]+$/.test(s);
}

function isValidPort(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}

function isValidUrl(v) {
  if (!v) return true;
  try {
    const u = new URL(String(v).trim());
    if (u.protocol !== 'https:') return false;
    return /\.(png|jpg|jpeg|webp|gif)(\?.*)?$/i.test(u.pathname);
  } catch {
    return false;
  }
}

function normalizeColor(v) {
  if (!v) return '0x2B2D31';
  const s = String(v).trim();
  if (/^0x[0-9A-Fa-f]{6}$/.test(s)) return s;
  if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s.replace('#', '0x');
  if (/^[0-9A-Fa-f]{6}$/.test(s)) return '0x' + s;
  return null;
}

function isValidGameId(v) {
  const s = String(v).trim();
  return /^\d{1,6}$/.test(s) && Number(s) >= 1 && Number(s) <= 999999;
}

function isValidPlayerName(v) {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (s.length < 2 || s.length > 32) return false;
  return /^[\p{L}0-9 _.'\-]{2,32}$/u.test(s);
}

function coerceDbValue(v) {
  if (v === null || v === undefined) return v;
  const s = String(v).trim();
  if (/^-?\d+$/.test(s)) return Number(s);
  if (s.toLowerCase() === 'true' || s.toLowerCase() === 't' || s.toLowerCase() === 'sim') return true;
  if (s.toLowerCase() === 'false' || s.toLowerCase() === 'f' || s.toLowerCase() === 'nao') return false;
  return s;
}

function normStatus(v) {
  if (v === true || v === 1) return 'liberado';
  if (v === false || v === 0) return 'bloqueado';
  if (Buffer.isBuffer(v)) v = v.toString('utf8');
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 't', 'sim', 'yes', 'y', 'liberado'].includes(s)) return 'liberado';
  if (['0', 'false', 'f', 'nao', 'não', 'no', 'n', 'bloqueado'].includes(s)) return 'bloqueado';
  return s;
}

function statusJaLiberado(statusAtual, valorLiberado) {
  return normStatus(statusAtual) === normStatus(coerceDbValue(valorLiberado));
}

function bancoConfigCompleto(b) {
  const req = ['tipo', 'host', 'porta', 'usuario', 'senha', 'database', 'tabela', 'colunaId', 'colunaStatus', 'valorLiberado'];
  for (const k of req) {
    if (b[k] === null || b[k] === undefined || String(b[k]).length === 0) return { ok: false, faltando: k };
  }
  if (!['mysql', 'postgres'].includes(b.tipo)) return { ok: false, faltando: 'tipo' };
  if (!isValidHost(b.host)) return { ok: false, faltando: 'host' };
  if (!isValidPort(b.porta)) return { ok: false, faltando: 'porta' };
  if (!isValidDbUser(b.usuario)) return { ok: false, faltando: 'usuario' };
  if (!isValidDbName(b.database)) return { ok: false, faltando: 'database' };
  if (!isValidSqlIdent(b.tabela)) return { ok: false, faltando: 'tabela' };
  if (!isValidSqlIdent(b.colunaId)) return { ok: false, faltando: 'colunaId' };
  if (!isValidSqlIdent(b.colunaStatus)) return { ok: false, faltando: 'colunaStatus' };
  if (b.colunaNome && !isValidSqlIdent(b.colunaNome)) return { ok: false, faltando: 'colunaNome' };
  return { ok: true };
}

function friendlyDbError(e) {
  const msg = String((e && e.message) || 'erro desconhecido');
  if (/ECONNREFUSED/i.test(msg)) return 'Conexao recusada. Confira IP/porta e se o banco aceita conexao externa.';
  if (/ETIMEDOUT|timeout/i.test(msg)) return 'Tempo esgotado. IP pode estar bloqueado no firewall ou host incorreto.';
  if (/ER_ACCESS_DENIED|password|authentication|28P01|28000/i.test(msg)) return 'Usuario ou senha invalidos.';
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(msg)) return 'Host nao encontrado. Confira o endereco do banco.';
  if (/nao encontrada|nao existe/i.test(msg)) return msg;
  if (/SSL|ssl/i.test(msg)) return 'Falha de SSL. Para Supabase ative ssl true, para MySQL local use ssl false.';
  return 'Falha de banco. Confira os dados com /config ver e teste de novo.';
}

module.exports = {
  isValidSqlIdent, isValidDbName, isValidDbUser, isValidHost, isValidPort, isValidUrl,
  normalizeColor, isValidGameId, isValidPlayerName,
  coerceDbValue, normStatus, statusJaLiberado, bancoConfigCompleto, friendlyDbError
};
