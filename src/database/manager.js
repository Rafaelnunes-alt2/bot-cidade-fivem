// feito por: maquinzz
const mysql = require('mysql2/promise');
const { Client } = require('pg');
const { isValidSqlIdent, coerceDbValue, statusJaLiberado } = require('../discord/utils/validators');

function assertIdents(banco) {
  const campos = [['tabela', banco.tabela], ['colunaId', banco.colunaId], ['colunaStatus', banco.colunaStatus]];
  if (banco.colunaNome) campos.push(['colunaNome', banco.colunaNome]);
  for (const [k, v] of campos) {
    if (!isValidSqlIdent(v)) throw new Error('Identificador SQL invalido em ' + k + ': ' + v);
  }
}

function qMysql(ident) {
  return '`' + String(ident).replace(/`/g, '') + '`';
}

function qPg(ident) {
  return '"' + String(ident).replace(/"/g, '') + '"';
}

async function withMysql(banco, fn) {
  const conn = await mysql.createConnection({
    host: banco.host,
    port: Number(banco.porta),
    user: banco.usuario,
    password: banco.senha,
    database: banco.database,
    connectTimeout: 8000,
    charset: 'utf8mb4',
    ssl: banco.ssl ? { rejectUnauthorized: false } : undefined
  });
  try {
    return await fn(conn);
  } finally {
    try { await conn.end(); } catch {}
  }
}

async function withPg(banco, fn) {
  const client = new Client({
    host: banco.host,
    port: Number(banco.porta),
    user: banco.usuario,
    password: banco.senha,
    database: banco.database,
    connectionTimeoutMillis: 8000,
    query_timeout: 8000,
    ssl: banco.ssl ? { rejectUnauthorized: false } : false
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    try { await client.end(); } catch {}
  }
}

async function testConnection(banco) {
  assertIdents(banco);
  const cols = [banco.colunaId, banco.colunaStatus];
  if (banco.colunaNome) cols.push(banco.colunaNome);
  if (banco.tipo === 'mysql') {
    return withMysql(banco, async (conn) => {
      await conn.query('SELECT 1 AS ok');
      const lista = cols.map(qMysql).join(', ');
      const sql = 'SELECT ' + lista + ' FROM ' + qMysql(banco.tabela) + ' LIMIT 1';
      try {
        await conn.query(sql);
      } catch (e) {
        const code = String((e && e.code) || '');
        if (code === 'ER_NO_SUCH_TABLE') throw new Error('Tabela ' + banco.tabela + ' nao encontrada no database ' + banco.database);
        if (code === 'ER_BAD_FIELD_ERROR') throw new Error('Coluna invalida na tabela ' + banco.tabela + '. Confira coluna-id, coluna-status e coluna-nome.');
        throw e;
      }
      return true;
    });
  }
  if (banco.tipo === 'postgres') {
    return withPg(banco, async (client) => {
      await client.query('SELECT 1 AS ok');
      const lista = cols.map(qPg).join(', ');
      const sql = 'SELECT ' + lista + ' FROM ' + qPg(banco.tabela) + ' LIMIT 1';
      try {
        await client.query(sql);
      } catch (e) {
        const code = String((e && e.code) || '');
        if (code === '42P01') throw new Error('Tabela ' + banco.tabela + ' nao encontrada no database ' + banco.database);
        if (code === '42703') throw new Error('Coluna invalida na tabela ' + banco.tabela + '. Confira coluna-id, coluna-status e coluna-nome.');
        throw e;
      }
      return true;
    });
  }
  throw new Error('Tipo de banco invalido. Use mysql ou postgres.');
}

async function sampleIds(banco, limite) {
  assertIdents(banco);
  const n = Math.min(Math.max(Number(limite) || 5, 1), 10);
  if (banco.tipo === 'mysql') {
    return withMysql(banco, async (conn) => {
      const colN = banco.colunaNome ? ', ' + qMysql(banco.colunaNome) + ' AS nome' : '';
      const sql = 'SELECT ' + qMysql(banco.colunaId) + ' AS id, ' + qMysql(banco.colunaStatus) + ' AS status' + colN + ' FROM ' + qMysql(banco.tabela) + ' ORDER BY ' + qMysql(banco.colunaId) + ' DESC LIMIT ' + n;
      const [rows] = await conn.query(sql);
      return rows;
    });
  }
  return withPg(banco, async (client) => {
    const colN = banco.colunaNome ? ', ' + qPg(banco.colunaNome) + ' AS nome' : '';
    const sql = 'SELECT ' + qPg(banco.colunaId) + ' AS id, ' + qPg(banco.colunaStatus) + ' AS status' + colN + ' FROM ' + qPg(banco.tabela) + ' ORDER BY ' + qPg(banco.colunaId) + ' DESC LIMIT ' + n;
    const r = await client.query(sql);
    return r.rows;
  });
}

async function findRegistro(banco, gameId) {
  assertIdents(banco);
  const whereVal = /^\d+$/.test(String(gameId)) ? Number(gameId) : String(gameId);
  if (banco.tipo === 'mysql') {
    return withMysql(banco, async (conn) => {
      const colN = banco.colunaNome ? ', ' + qMysql(banco.colunaNome) + ' AS nome' : '';
      const sql = 'SELECT ' + qMysql(banco.colunaId) + ' AS id, ' + qMysql(banco.colunaStatus) + ' AS status' + colN + ' FROM ' + qMysql(banco.tabela) + ' WHERE ' + qMysql(banco.colunaId) + ' = ? LIMIT 1';
      const [rows] = await conn.query(sql, [whereVal]);
      return rows[0] || null;
    });
  }
  return withPg(banco, async (client) => {
    const colN = banco.colunaNome ? ', ' + qPg(banco.colunaNome) + ' AS nome' : '';
    const sql = 'SELECT ' + qPg(banco.colunaId) + ' AS id, ' + qPg(banco.colunaStatus) + ' AS status' + colN + ' FROM ' + qPg(banco.tabela) + ' WHERE ' + qPg(banco.colunaId) + ' = $1 LIMIT 1';
    const r = await client.query(sql, [whereVal]);
    return r.rows[0] || null;
  });
}

async function liberarId(banco, gameId, nomePlayer) {
  assertIdents(banco);
  const liberado = coerceDbValue(banco.valorLiberado);
  const whereVal = /^\d+$/.test(String(gameId)) ? Number(gameId) : String(gameId);
  if (banco.tipo === 'mysql') {
    return withMysql(banco, async (conn) => {
      let sql;
      let params;
      if (banco.colunaNome && nomePlayer) {
        sql = 'UPDATE ' + qMysql(banco.tabela) + ' SET ' + qMysql(banco.colunaStatus) + ' = ?, ' + qMysql(banco.colunaNome) + ' = ? WHERE ' + qMysql(banco.colunaId) + ' = ?';
        params = [liberado, String(nomePlayer).slice(0, 64), whereVal];
      } else {
        sql = 'UPDATE ' + qMysql(banco.tabela) + ' SET ' + qMysql(banco.colunaStatus) + ' = ? WHERE ' + qMysql(banco.colunaId) + ' = ?';
        params = [liberado, whereVal];
      }
      const [res] = await conn.query(sql, params);
      return { afetados: res.affectedRows || 0 };
    });
  }
  return withPg(banco, async (client) => {
    let sql;
    let params;
    if (banco.colunaNome && nomePlayer) {
      sql = 'UPDATE ' + qPg(banco.tabela) + ' SET ' + qPg(banco.colunaStatus) + ' = $1, ' + qPg(banco.colunaNome) + ' = $2 WHERE ' + qPg(banco.colunaId) + ' = $3';
      params = [liberado, String(nomePlayer).slice(0, 64), whereVal];
    } else {
      sql = 'UPDATE ' + qPg(banco.tabela) + ' SET ' + qPg(banco.colunaStatus) + ' = $1 WHERE ' + qPg(banco.colunaId) + ' = $2';
      params = [liberado, whereVal];
    }
    const r = await client.query(sql, params);
    return { afetados: r.rowCount || 0 };
  });
}

async function revogarId(banco, gameId) {
  assertIdents(banco);
  const bloqueado = banco.valorBloqueado !== null && banco.valorBloqueado !== undefined && String(banco.valorBloqueado).length > 0
    ? coerceDbValue(banco.valorBloqueado)
    : coerceDbValue(banco.valorLiberado) === 1 ? 0 : false;
  const whereVal = /^\d+$/.test(String(gameId)) ? Number(gameId) : String(gameId);
  if (banco.tipo === 'mysql') {
    return withMysql(banco, async (conn) => {
      const sql = 'UPDATE ' + qMysql(banco.tabela) + ' SET ' + qMysql(banco.colunaStatus) + ' = ? WHERE ' + qMysql(banco.colunaId) + ' = ?';
      const [res] = await conn.query(sql, [bloqueado, whereVal]);
      return { afetados: res.affectedRows || 0 };
    });
  }
  return withPg(banco, async (client) => {
    const sql = 'UPDATE ' + qPg(banco.tabela) + ' SET ' + qPg(banco.colunaStatus) + ' = $1 WHERE ' + qPg(banco.colunaId) + ' = $2';
    const r = await client.query(sql, [bloqueado, whereVal]);
    return { afetados: r.rowCount || 0 };
  });
}

async function listarPendentes(banco, limite) {
  assertIdents(banco);
  const n = Math.min(Math.max(Number(limite) || 10, 1), 25);
  const temBloqueado = banco.valorBloqueado !== null && banco.valorBloqueado !== undefined && String(banco.valorBloqueado).length > 0;
  if (banco.tipo === 'mysql') {
    return withMysql(banco, async (conn) => {
      const colN = banco.colunaNome ? ', ' + qMysql(banco.colunaNome) + ' AS nome' : '';
      let sql;
      let params = [];
      if (temBloqueado) {
        sql = 'SELECT ' + qMysql(banco.colunaId) + ' AS id' + colN + ' FROM ' + qMysql(banco.tabela) + ' WHERE ' + qMysql(banco.colunaStatus) + ' = ? ORDER BY ' + qMysql(banco.colunaId) + ' DESC LIMIT ' + n;
        params = [coerceDbValue(banco.valorBloqueado)];
      } else {
        sql = 'SELECT ' + qMysql(banco.colunaId) + ' AS id' + colN + ' FROM ' + qMysql(banco.tabela) + ' WHERE ' + qMysql(banco.colunaStatus) + ' != ? ORDER BY ' + qMysql(banco.colunaId) + ' DESC LIMIT ' + n;
        params = [coerceDbValue(banco.valorLiberado)];
      }
      const [rows] = await conn.query(sql, params);
      return rows;
    });
  }
  return withPg(banco, async (client) => {
    const colN = banco.colunaNome ? ', ' + qPg(banco.colunaNome) + ' AS nome' : '';
    let sql;
    let params = [];
    if (temBloqueado) {
      sql = 'SELECT ' + qPg(banco.colunaId) + ' AS id' + colN + ' FROM ' + qPg(banco.tabela) + ' WHERE ' + qPg(banco.colunaStatus) + ' = $1 ORDER BY ' + qPg(banco.colunaId) + ' DESC LIMIT ' + n;
      params = [coerceDbValue(banco.valorBloqueado)];
    } else {
      sql = 'SELECT ' + qPg(banco.colunaId) + ' AS id' + colN + ' FROM ' + qPg(banco.tabela) + ' WHERE ' + qPg(banco.colunaStatus) + ' != $1 ORDER BY ' + qPg(banco.colunaId) + ' DESC LIMIT ' + n;
      params = [coerceDbValue(banco.valorLiberado)];
    }
    const r = await client.query(sql, params);
    return r.rows;
  });
}

module.exports = { testConnection, sampleIds, findRegistro, liberarId, revogarId, listarPendentes, statusJaLiberado };
