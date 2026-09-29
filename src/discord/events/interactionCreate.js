// feito por: maquinzz
const { erroEmbed } = require('../utils/embeds');
const store = require('../../store/guildStore');
const { handleButton } = require('../components/buttons');
const { handleModal } = require('../components/modals');
const { handleSenhaModal } = require('../commands/config');
const wizCidade = require('../commands/wizardCidade');
const wizBot = require('../commands/wizardBot');
const log = require('../utils/logger');

function buildHandler(commands) {
  return async function onInteraction(interaction) {
    try {
      if (interaction.isChatInputCommand()) {
        const cmd = commands.get(interaction.commandName);
        if (!cmd) return;
        await cmd.execute(interaction);
        return;
      }
      if (interaction.isButton()) {
        if (await wizBot.handleButton(interaction)) return;
        if (await wizCidade.handleButton(interaction)) return;
        const done = await handleButton(interaction);
        if (!done && !interaction.replied && !interaction.deferred) {
          await interaction.reply({ embeds: [erroEmbed('Botao expirado. Solicite um novo painel a administracao.', store.getConfig(interaction.guildId))], ephemeral: true });
        }
        return;
      }
      if (interaction.isAnySelectMenu && interaction.isAnySelectMenu()) {
        if (await wizCidade.handleSelect(interaction)) return;
        return;
      }
      if (interaction.isModalSubmit()) {
        if (await wizBot.handleModal(interaction)) return;
        if (await wizCidade.handleModal(interaction)) return;
        if (await handleSenhaModal(interaction)) return;
        await handleModal(interaction);
        return;
      }
    } catch (e) {
      log.error('interaction error', e);
      try {
        const msg = 'Ocorreu um erro interno. Tente novamente.';
        if (interaction.deferred || interaction.replied) await interaction.editReply({ embeds: [erroEmbed(msg, store.getConfig(interaction.guildId))] });
        else await interaction.reply({ embeds: [erroEmbed(msg, store.getConfig(interaction.guildId))], ephemeral: true });
      } catch {}
    }
  };
}

module.exports = { buildHandler };
