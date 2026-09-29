// feito por: maquinzz
const store = require('../../store/guildStore');
const { findRegistro, liberarId, statusJaLiberado } = require('../../database/manager');
const { sucessoEmbed, erroEmbed, infoEmbed, logEmbed, boasVindasEmbed } = require('../utils/embeds');
const { isValidGameId, isValidPlayerName, bancoConfigCompleto, friendlyDbError } = require('../utils/validators');
const { checkCooldown, acquireLock, releaseLock, botCanManageRole, botCanSend, isGuildInteraction } = require('../utils/permissions');
const log = require('../utils/logger');

async function aplicarCargo(guild, userId, cargoId) {
  const member = await guild.members.fetch(userId);
  if (member.roles.cache.has(cargoId)) return { jaTinha: true };
  await member.roles.add(cargoId, 'ID liberado via bot');
  return { jaTinha: false };
}

function cargoErrorMsg(e) {
  const msg = String((e && e.message) || '');
  if (/Missing Permissions|50013/i.test(msg)) return 'Seu ID foi liberado no banco, mas o bot nao tem permissao para dar o cargo. Fale com a administracao.';
  if (/hierarchy|50028/i.test(msg)) return 'Seu ID foi liberado no banco, mas o cargo esta acima do bot. Fale com a administracao.';
  if (/Unknown Member|10007/i.test(msg)) return 'Nao encontrei voce no servidor. Saia e entre de novo e tente.';
  return 'Seu ID foi liberado no banco, mas nao consegui aplicar o cargo. Fale com a administracao.';
}

async function handleModal(interaction) {
  if (interaction.customId !== 'liberar_id_modal') return false;
  if (!isGuildInteraction(interaction)) {
    await interaction.reply({ embeds: [erroEmbed('Use o painel dentro do servidor.', store.getConfig(interaction.guildId))], ephemeral: true });
    return true;
  }
  const espera = checkCooldown(interaction.user.id, 10000);
  if (espera > 0) {
    await interaction.reply({ embeds: [erroEmbed('Aguarde ' + espera + ' segundos antes de tentar novamente.', store.getConfig(interaction.guildId))], ephemeral: true });
    return true;
  }
  await interaction.deferReply({ ephemeral: true });
  const guildId = interaction.guildId;
  const userLock = 'user:' + guildId + ':' + interaction.user.id;
  if (!acquireLock(userLock)) {
    await interaction.editReply({ embeds: [erroEmbed('Voce ja tem uma liberacao em andamento. Aguarde.', store.getConfig(interaction.guildId)) ] });
    return true;
  }
  try {
    const cfg = store.getConfig(guildId);
    const nomePlayer = (interaction.fields.getTextInputValue('nome_player') || '').trim();
    const gameId = (interaction.fields.getTextInputValue('id_player') || '').trim();

    if (!isValidPlayerName(nomePlayer)) {
      await interaction.editReply({ embeds: [erroEmbed('Nome invalido. Use de 2 a 32 letras. Acentos sao aceitos.', store.getConfig(interaction.guildId)) ] });
      return true;
    }
    if (!isValidGameId(gameId)) {
      await interaction.editReply({ embeds: [erroEmbed('ID invalido. Informe apenas o numero que aparece na tela do jogo, de 1 a 999999.', store.getConfig(interaction.guildId)) ] });
      return true;
    }
    if (store.senhaPrecisaReconfigurar(guildId)) {
      await interaction.editReply({ embeds: [erroEmbed('Sistema em manutencao. Fale com a administracao.', store.getConfig(interaction.guildId)) ] });
      return true;
    }
    const banco = store.getBancoComSenha(guildId);
    const check = bancoConfigCompleto(banco);
    if (!check.ok) {
      await interaction.editReply({ embeds: [erroEmbed('Sistema em manutencao. Fale com a administracao.', store.getConfig(interaction.guildId)) ] });
      return true;
    }
    if (!cfg.liberacao.cargoId) {
      await interaction.editReply({ embeds: [erroEmbed('Sistema em manutencao. Fale com a administracao.', store.getConfig(interaction.guildId)) ] });
      return true;
    }
    const chkCargo = botCanManageRole(interaction.guild, cfg.liberacao.cargoId);
    if (!chkCargo.ok) {
      await interaction.editReply({ embeds: [erroEmbed('Sistema em manutencao. Fale com a administracao.', store.getConfig(interaction.guildId)) ] });
      log.warn('Cargo invalido na guild ' + guildId + ': ' + chkCargo.motivo);
      return true;
    }

    const dono = store.buscarLiberadoPorGame(guildId, gameId);
    if (dono && dono.discord_id !== interaction.user.id) {
      await interaction.editReply({ embeds: [erroEmbed('Este ID ja foi liberado por outra conta. Se e voce, fale com a administracao.', store.getConfig(interaction.guildId)) ] });
      return true;
    }
    const meus = store.buscarPorDiscord(guildId, interaction.user.id);
    const maxIds = cfg.liberacao.maxIds === undefined || cfg.liberacao.maxIds === null ? 1 : Number(cfg.liberacao.maxIds);
    if (!meus.some(r => r.game_id === String(gameId)) && maxIds > 0 && meus.length >= maxIds) {
      await interaction.editReply({ embeds: [erroEmbed('Voce ja atingiu o limite de ' + maxIds + ' ID por conta. Fale com a administracao.', store.getConfig(interaction.guildId)) ] });
      return true;
    }

    const idLock = 'game:' + guildId + ':' + gameId;
    if (!acquireLock(idLock)) {
      await interaction.editReply({ embeds: [erroEmbed('Este ID esta sendo liberado agora. Aguarde e tente de novo.', store.getConfig(interaction.guildId)) ] });
      return true;
    }
    try {
      let registro;
      try {
        registro = await findRegistro(banco, gameId);
      } catch (e) {
        log.error('findRegistro falhou', e);
        await interaction.editReply({ embeds: [erroEmbed('Erro ao consultar o banco da cidade. Tente novamente em instantes.', store.getConfig(interaction.guildId))] });
        return true;
      }
      if (!registro) {
        await interaction.editReply({ embeds: [erroEmbed('ID ' + gameId + ' nao encontrado no banco da cidade.\n\nEntre na cidade uma vez para criar o registro e tente de novo. Se o erro continuar, fale com a administracao.', store.getConfig(interaction.guildId))] });
        return true;
      }
      if (statusJaLiberado(registro.status, banco.valorLiberado)) {
        try {
          await aplicarCargo(interaction.guild, interaction.user.id, cfg.liberacao.cargoId);
          store.registrarLiberado(guildId, gameId, interaction.user.id, nomePlayer);
        } catch (e) {
          log.warn('Falha ao garantir cargo de ja liberado: ' + e.message);
        }
        await interaction.editReply({ embeds: [infoEmbed('ID ja liberado', 'O ID ' + gameId + ' ja estava liberado. O cargo foi garantido para voce.', cfg)] });
        return true;
      }

      let res;
      try {
        res = await liberarId(banco, gameId, nomePlayer);
      } catch (e) {
        log.error('liberarId falhou', e);
        await interaction.editReply({ embeds: [erroEmbed('Erro ao liberar no banco: ' + friendlyDbError(e), store.getConfig(interaction.guildId))] });
        return true;
      }
      if (!res || res.afetados === 0) {
        await interaction.editReply({ embeds: [erroEmbed('Nenhum registro foi atualizado. O ID pode ter sido alterado. Fale com a administracao.', store.getConfig(interaction.guildId))] });
        return true;
      }

      try {
        await aplicarCargo(interaction.guild, interaction.user.id, cfg.liberacao.cargoId);
      } catch (e) {
        log.error('aplicarCargo falhou', e);
        await interaction.editReply({ embeds: [erroEmbed(cargoErrorMsg(e) + ' Informe seu ID ' + gameId + '.', store.getConfig(interaction.guildId))] });
        try {
          if (cfg.liberacao.canalLogsId) {
            const ch = await interaction.guild.channels.fetch(cfg.liberacao.canalLogsId).catch(() => null);
            if (ch && botCanSend(ch).ok) await ch.send({ embeds: [logEmbed(cfg, interaction.user.id, nomePlayer, gameId, res.afetados, interaction.guild)] });
          }
        } catch {}
        return true;
      }

      store.registrarLiberado(guildId, gameId, interaction.user.id, nomePlayer);
      await interaction.editReply({ embeds: [sucessoEmbed(cfg, nomePlayer, gameId, interaction.guild)] });
      try {
        const dm = await interaction.user.createDM();
        await dm.send({ embeds: [boasVindasEmbed(cfg, nomePlayer, gameId, interaction.guild)] });
      } catch {}
      try {
        if (cfg.liberacao.canalLogsId) {
          const ch = await interaction.guild.channels.fetch(cfg.liberacao.canalLogsId).catch(() => null);
          if (ch && botCanSend(ch).ok) await ch.send({ embeds: [logEmbed(cfg, interaction.user.id, nomePlayer, gameId, res.afetados, interaction.guild)] });
        }
      } catch (e) {
        log.warn('Falha ao enviar log: ' + e.message);
      }
      return true;
    } finally {
      releaseLock(idLock);
    }
  } finally {
    releaseLock(userLock);
  }
}

module.exports = { handleModal };
