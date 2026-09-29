// feito por: maquinzz
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const store = require('../../store/guildStore');
const { statsEmbed, erroEmbed } = require('../utils/embeds');
const { isAdmin, isGuildInteraction } = require('../utils/permissions');

const data = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('Ver estatisticas de liberacao da cidade')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function execute(interaction) {
  if (!isGuildInteraction(interaction)) {
    return interaction.reply({ embeds: [erroEmbed('Use este comando dentro do servidor.', store.getConfig(interaction.guildId))], ephemeral: true });
  }
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ embeds: [erroEmbed('Apenas administradores podem usar este comando.', store.getConfig(interaction.guildId))], ephemeral: true });
  }
  const cfg = store.getConfig(interaction.guildId);
  const s = store.statsLiberados(interaction.guildId);
  return interaction.reply({ embeds: [statsEmbed(cfg, s)], ephemeral: true });
}

module.exports = { data, execute };
