// feito por: maquinzz
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { wrapEncrypted, unwrapSafe } = require('../database/crypto');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'guilds.sqlite');
const db = new Database(DB_PATH, { timeout: 5000 });
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS guild_configs (
  guild_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS liberados (
  guild_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  nome_player TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, game_id)
);
CREATE INDEX IF NOT EXISTS idx_liberados_discord ON liberados (guild_id, discord_id);
CREATE INDEX IF NOT EXISTS idx_liberados_created ON liberados (guild_id, created_at);
`);

const cache = new Map();

function defaultConfig() {
  return {
    cidade: { nome: null, logo: null, mostrarLogo: true, banner: null, mostrarBanner: true, mostrarCreditos: true, cor: '0x2B2D31', descricao: null },
    banco: {
      tipo: null, host: null, porta: null, usuario: null,
      senha: null, database: null, ssl: false,
      tabela: null, colunaId: null, colunaStatus: null,
      colunaNome: null, valorLiberado: null, valorBloqueado: null
    },
    liberacao: { cargoId: null, canalLogsId: null, painelCanalId: null, painelMensagemId: null, titulo: null, descricao: null, textoBotao: 'Liberar ID', maxIds: 1, ipServidor: null, instrucoes: null, revogarAoSair: false },
    servidor: { ip: null, porta: null },
    bot: { status: null, atividadeTipo: null, atividadeTexto: null, atividadeUrl: null },
    criadoEm: Date.now()
  };
}

function loadRaw(guildId) {
  try {
    const row = db.prepare('SELECT data FROM guild_configs WHERE guild_id = ?').get(guildId);
    if (!row) return null;
    return JSON.parse(row.data);
  } catch {
    return null;
  }
}

function getConfig(guildId) {
  const hit = cache.get(guildId);
  if (hit) return hit;
  const saved = loadRaw(guildId);
  const base = defaultConfig();
  const cfg = !saved ? base : {
    cidade: { ...base.cidade, ...(saved.cidade || {}) },
    banco: { ...base.banco, ...(saved.banco || {}) },
    liberacao: { ...base.liberacao, ...(saved.liberacao || {}) },
    servidor: { ...base.servidor, ...(saved.servidor || {}) },
    bot: { ...base.bot, ...(saved.bot || {}) },
    criadoEm: saved.criadoEm || base.criadoEm
  };
  cache.set(guildId, cfg);
  return cfg;
}

function saveConfig(guildId, config) {
  db.prepare(`
    INSERT INTO guild_configs (guild_id, data, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run(guildId, JSON.stringify(config), Date.now());
  cache.set(guildId, config);
}

function setCidade(guildId, fields) {
  const cfg = getConfig(guildId);
  if (fields.nome !== undefined) cfg.cidade.nome = fields.nome;
  if (fields.logo !== undefined) cfg.cidade.logo = fields.logo;
  if (fields.mostrarLogo !== undefined) cfg.cidade.mostrarLogo = fields.mostrarLogo;
  if (fields.banner !== undefined) cfg.cidade.banner = fields.banner;
  if (fields.mostrarBanner !== undefined) cfg.cidade.mostrarBanner = fields.mostrarBanner;
  if (fields.mostrarCreditos !== undefined) cfg.cidade.mostrarCreditos = fields.mostrarCreditos;
  if (fields.cor !== undefined) cfg.cidade.cor = fields.cor;
  if (fields.descricao !== undefined) cfg.cidade.descricao = fields.descricao;
  saveConfig(guildId, cfg);
  return cfg;
}

function setBanco(guildId, fields) {
  const cfg = getConfig(guildId);
  for (const k of ['tipo', 'host', 'porta', 'usuario', 'database', 'ssl', 'tabela', 'colunaId', 'colunaStatus', 'colunaNome', 'valorLiberado', 'valorBloqueado']) {
    if (fields[k] !== undefined) cfg.banco[k] = fields[k];
  }
  if (fields.senha !== undefined) {
    cfg.banco.senha = fields.senha ? wrapEncrypted(fields.senha) : null;
  }
  saveConfig(guildId, cfg);
  return cfg;
}

function setBot(guildId, fields) {
  const cfg = getConfig(guildId);
  for (const k of ['status', 'atividadeTipo', 'atividadeTexto', 'atividadeUrl']) {
    if (fields[k] !== undefined) cfg.bot[k] = fields[k];
  }
  saveConfig(guildId, cfg);
  return cfg;
}

function setLiberacao(guildId, fields) {
  const cfg = getConfig(guildId);
  for (const k of ['cargoId', 'canalLogsId', 'painelCanalId', 'painelMensagemId', 'titulo', 'descricao', 'textoBotao', 'maxIds', 'ipServidor', 'instrucoes', 'revogarAoSair']) {
    if (fields[k] !== undefined) cfg.liberacao[k] = fields[k];
  }
  saveConfig(guildId, cfg);
  return cfg;
}

function setServidor(guildId, fields) {
  const cfg = getConfig(guildId);
  for (const k of ['ip', 'porta']) {
    if (fields[k] !== undefined) cfg.servidor[k] = fields[k];
  }
  saveConfig(guildId, cfg);
  return cfg;
}

function getAnyPresence() {
  try {
    const rows = db.prepare('SELECT data FROM guild_configs').all();
    for (const r of rows) {
      try {
        const c = JSON.parse(r.data);
        if (c && c.bot && (c.bot.status || c.bot.atividadeTexto)) return c.bot;
      } catch {}
    }
  } catch {}
  return null;
}

function getBancoComSenha(guildId) {
  const cfg = getConfig(guildId);
  const senha = unwrapSafe(cfg.banco.senha);
  return { ...cfg.banco, senha };
}

function senhaPrecisaReconfigurar(guildId) {
  const cfg = getConfig(guildId);
  if (!cfg.banco.senha) return false;
  return unwrapSafe(cfg.banco.senha) === null;
}

function clearBanco(guildId) {
  const cfg = getConfig(guildId);
  cfg.banco = defaultConfig().banco;
  saveConfig(guildId, cfg);
  return cfg;
}

function buscarLiberadoPorGame(guildId, gameId) {
  try {
    return db.prepare('SELECT * FROM liberados WHERE guild_id = ? AND game_id = ?').get(guildId, String(gameId)) || null;
  } catch {
    return null;
  }
}

function buscarPorDiscord(guildId, discordId) {
  try {
    return db.prepare('SELECT * FROM liberados WHERE guild_id = ? AND discord_id = ? ORDER BY created_at DESC').all(guildId, discordId);
  } catch {
    return [];
  }
}

function contarDesde(guildId, since) {
  try {
    const r = db.prepare('SELECT COUNT(*) AS total FROM liberados WHERE guild_id = ? AND created_at >= ?').get(guildId, since);
    return Number(r.total) || 0;
  } catch {
    return 0;
  }
}

function statsLiberados(guildId) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return {
    total: contarDesde(guildId, 0),
    hoje: contarDesde(guildId, d.getTime()),
    dias7: contarDesde(guildId, Date.now() - 7 * 86400000),
    dias30: contarDesde(guildId, Date.now() - 30 * 86400000)
  };
}

function listarLiberados(guildId, limite) {
  try {
    const n = Math.min(Math.max(Number(limite) || 100, 1), 1000);
    return db.prepare('SELECT game_id, discord_id, nome_player, created_at FROM liberados WHERE guild_id = ? ORDER BY created_at DESC LIMIT ' + n).all(guildId);
  } catch {
    return [];
  }
}

function registrarLiberado(guildId, gameId, discordId, nomePlayer) {
  db.prepare(`
    INSERT INTO liberados (guild_id, game_id, discord_id, nome_player, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, game_id) DO UPDATE SET discord_id = excluded.discord_id, nome_player = excluded.nome_player, created_at = excluded.created_at
  `).run(guildId, String(gameId), discordId, nomePlayer, Date.now());
}

function removerLiberado(guildId, gameId) {
  db.prepare('DELETE FROM liberados WHERE guild_id = ? AND game_id = ?').run(guildId, String(gameId));
}

module.exports = {
  getConfig, saveConfig, setCidade, setBanco, setLiberacao, setBot, getAnyPresence, setServidor,
  getBancoComSenha, senhaPrecisaReconfigurar, clearBanco,
  buscarLiberadoPorGame, buscarPorDiscord, contarDesde, statsLiberados, listarLiberados,
  registrarLiberado, removerLiberado, defaultConfig
};
