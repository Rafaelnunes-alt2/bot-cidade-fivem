// feito por: maquinzz
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const store = require('../../store/guildStore');
const { erroEmbed } = require('../utils/embeds');
const { isGuildInteraction } = require('../utils/permissions');

function buildLiberarModal() {
  const modal = new ModalBuilder().setCustomId('liberar_id_modal').setTitle('Liberar ID');
  const nome = new TextInputBuilder()
    .setCustomId('nome_player')
    .setLabel('Nome do personagem')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Ex: Carlos Silva')
    .setRequired(true).setMinLength(2).setMaxLength(32);
  const gameId = new TextInputBuilder()
    .setCustomId('id_player')
    .setLabel('ID que aparece na tela do jogo')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Ex: 45')
    .setRequired(true).setMinLength(1).setMaxLength(6);
  modal.addComponents(
    new ActionRowBuilder().addComponents(nome),
    new ActionRowBuilder().addComponents(gameId)
  );
  return modal;
}

async function handleButton(interaction) {
  if (interaction.customId !== 'liberar_id_btn') return false;
  if (!isGuildInteraction(interaction)) {
    await interaction.reply({ embeds: [erroEmbed('Use o painel dentro do servidor.', store.getConfig(interaction.guildId))], ephemeral: true });
    return true;
  }
  const cfg = store.getConfig(interaction.guildId);
  const banco = store.getBancoComSenha(interaction.guildId);
  if (!banco.host || !banco.tabela || !banco.senha) {
    await interaction.reply({ embeds: [erroEmbed('Sistema em manutencao. Fale com a administracao.', store.getConfig(interaction.guildId))], ephemeral: true });
    return true;
  }
  if (!cfg.liberacao.cargoId) {
    await interaction.reply({ embeds: [erroEmbed('Sistema em manutencao. Fale com a administracao.', store.getConfig(interaction.guildId))], ephemeral: true });
    return true;
  }
  await interaction.showModal(buildLiberarModal());
  return true;
}

module.exports = { handleButton, buildLiberarModal };
