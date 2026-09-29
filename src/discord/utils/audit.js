// feito por: maquinzz
const { auditEmbed } = require('./embeds');
const { botCanSend } = require('./permissions');
const log = require('./logger');

async function enviarAuditoria(guild, cfg, acao, adminId, detalhe) {
  try {
    if (!cfg.liberacao.canalLogsId) return;
    const ch = await guild.channels.fetch(cfg.liberacao.canalLogsId).catch(() => null);
    if (!ch) return;
    if (!botCanSend(ch).ok) return;
    await ch.send({ embeds: [auditEmbed(acao, adminId, detalhe, cfg, guild)] });
  } catch (e) {
    log.warn('Falha ao enviar auditoria: ' + e.message);
  }
}

module.exports = { enviarAuditoria };
