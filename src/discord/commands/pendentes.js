// feito por: maquinzz
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const store = require('../../store/guildStore');
const { listarPendentes } = require('../../database/manager');
const { pendentesEmbed, erroEmbed } = require('../utils/embeds');
const { isAdmin, isGuildInteraction } = require('../utils/permissions');
const { friendlyDbError } = require('../utils/validators');
const log = require('../utils/logger');

const data = new SlashCommandBuilder()
  .setName('pendentes')
  .setDescription('Listar IDs aguardando liberacao no banco (staff)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addIntegerOption(o => o.setName('limite').setDescription('Quantos mostrar, ate 25').setRequired(false).setMinValue(1).setMaxValue(25));

async function execute(interaction) {
  if (!isGuildInteraction(interaction)) {
    return interaction.reply({ embeds: [erroEmbed('Use este comando dentro do servidor.', store.getConfig(interaction.guildId))], ephemeral: true });
  }
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ embeds: [erroEmbed('Apenas administradores podem usar este comando.', store.getConfig(interaction.guildId))], ephemeral: true });
  }
  await interaction.deferReply({ ephemeral: true });
  try {
    const banco = store.getBancoComSenha(interaction.guildId);
    if (!banco.senha) return interaction.editReply({ embeds: [erroEmbed('Banco nao configurado. Rode /config banco.', store.getConfig(interaction.guildId))] });
    const limite = interaction.options.getInteger('limite') || 10;
    const rows = await listarPendentes(banco, limite);
    const cfg = store.getConfig(interaction.guildId);
    return interaction.editReply({ embeds: [pendentesEmbed(cfg, rows)] });
  } catch (e) {
    log.error('pendentes falhou', e);
    return interaction.editReply({ embeds: [erroEmbed('Falha na consulta: ' + friendlyDbError(e), store.getConfig(interaction.guildId))] });
  }
}

module.exports = { data, execute };
