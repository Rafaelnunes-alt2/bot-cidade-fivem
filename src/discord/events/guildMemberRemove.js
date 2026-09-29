// feito por: maquinzz
const store = require('../../store/guildStore');
const { revogarId } = require('../../database/manager');
const { logEmbed } = require('../utils/embeds');
const { botCanSend } = require('../utils/permissions');
const log = require('../utils/logger');

async function onGuildMemberRemove(member) {
  try {
    const guild = member.guild;
    if (!guild) return;
    const cfg = store.getConfig(guild.id);
    if (!cfg.liberacao.revogarAoSair) return;
    const banco = store.getBancoComSenha(guild.id);
    if (!banco.senha) return;
    const regs = store.buscarPorDiscord(guild.id, member.id);
    if (regs.length === 0) return;
    for (const r of regs) {
      try {
        await revogarId(banco, r.game_id);
      } catch (e) {
        log.warn('Revogacao automatica falhou para ' + r.game_id + ': ' + e.message);
        continue;
      }
      store.removerLiberado(guild.id, r.game_id);
      try {
        if (cfg.liberacao.canalLogsId) {
          const ch = await guild.channels.fetch(cfg.liberacao.canalLogsId).catch(() => null);
          if (ch && botCanSend(ch).ok) {
            await ch.send({ embeds: [logEmbed(cfg, member.id, r.nome_player, r.game_id, 1, guild).setTitle('ID revogado automatico (saiu do Discord)')] });
          }
        }
      } catch {}
    }
  } catch (e) {
    log.warn('guildMemberRemove falhou: ' + e.message);
  }
}

module.exports = { onGuildMemberRemove };
