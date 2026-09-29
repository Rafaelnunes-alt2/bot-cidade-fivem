// feito por: maquinzz
const { SlashCommandBuilder } = require('discord.js');
const store = require('../../store/guildStore');
const { infoEmbed } = require('../utils/embeds');

const data = new SlashCommandBuilder()
  .setName('guia')
  .setDescription('Guia rapido: como configurar tudo');

async function execute(interaction) {
  const cfg = interaction.guildId ? store.getConfig(interaction.guildId) : store.defaultConfig();
  const txt =
    'Comece por aqui\n' +
    '/config-toda-cidade abre o assistente da cidade em 5 etapas com botoes e menus. No final ele testa o banco e publica o painel sozinho.\n' +
    '/config-todo-bot abre o assistente do perfil do bot: nome, avatar, apelido, status e atividade.\n\n' +
    'Dia a dia\n' +
    '/painel publica o painel de liberacao. /stats mostra totais. /status mostra o servidor FiveM. /pendentes lista IDs aguardando.\n\n' +
    'Ajustes finos\n' +
    '/config cidade, banco, liberacao, servidor, ver, testar, consultar, revogar, exportar.\n' +
    '/config-bot nome, avatar, nick, status, atividade, ver.\n\n' +
    'Bio do perfil: peca ao Maquinzz, apenas ele pode alterar.';
  return interaction.reply({ embeds: [infoEmbed('Guia do bot', txt, cfg)], ephemeral: true });
}

module.exports = { data, execute };
