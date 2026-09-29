// feito por: maquinzz
const { SlashCommandBuilder } = require('discord.js');
const store = require('../../store/guildStore');
const { statusServidorEmbed, erroEmbed } = require('../utils/embeds');
const { isGuildInteraction, checkCooldown } = require('../utils/permissions');

const data = new SlashCommandBuilder()
  .setName('status')
  .setDescription('Ver se o servidor da cidade esta online e quantos jogando');

async function buscar(url, ms) {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error('http ' + res.status);
  return res.json();
}

async function execute(interaction) {
  if (!isGuildInteraction(interaction)) {
    return interaction.reply({ embeds: [erroEmbed('Use este comando dentro do servidor.', store.getConfig(interaction.guildId))], ephemeral: true });
  }
  const espera = checkCooldown('status:' + interaction.user.id, 15000);
  if (espera > 0) {
    return interaction.reply({ embeds: [erroEmbed('Aguarde ' + espera + ' segundos para ver o status de novo.', store.getConfig(interaction.guildId))], ephemeral: true });
  }
  const cfg = store.getConfig(interaction.guildId);
  if (!cfg.servidor.ip || !cfg.servidor.porta) {
    return interaction.reply({ embeds: [erroEmbed('Status do servidor ainda nao configurado. A administracao configura com /config servidor.', store.getConfig(interaction.guildId))], ephemeral: true });
  }
  await interaction.deferReply();
  const base = 'http://' + cfg.servidor.ip + ':' + cfg.servidor.porta;
  try {
    const [players, info] = await Promise.all([
      buscar(base + '/players.json', 6000),
      buscar(base + '/info.json', 6000).catch(() => null)
    ]);
    const total = Array.isArray(players) ? players.length : 0;
    const max = info && info.vars && info.vars.sv_maxClients ? Number(info.vars.sv_maxClients) : null;
    const host = info && info.vars && info.vars.sv_hostname ? String(info.vars.sv_hostname).slice(0, 80) : null;
    return interaction.editReply({ embeds: [statusServidorEmbed(cfg, true, total, max, host)] });
  } catch {
    return interaction.editReply({ embeds: [statusServidorEmbed(cfg, false)] });
  }
}

module.exports = { data, execute };
