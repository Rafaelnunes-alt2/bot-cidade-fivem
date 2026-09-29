// feito por: maquinzz
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const configCmd = require('./src/discord/commands/config');
const painelCmd = require('./src/discord/commands/painel');
const configBotCmd = require('./src/discord/commands/configbot');
const statsCmd = require('./src/discord/commands/stats');
const statusCmd = require('./src/discord/commands/status');
const pendentesCmd = require('./src/discord/commands/pendentes');
const wizCidadeCmd = require('./src/discord/commands/wizardCidade');
const wizBotCmd = require('./src/discord/commands/wizardBot');
const guiaCmd = require('./src/discord/commands/guia');

async function main() {
  const token = (process.env.TOKEN || '').trim();
  const clientId = (process.env.CLIENT_ID || '').trim();
  const guildId = (process.env.GUILD_ID || '').trim();
  if (!token || !clientId) throw new Error('Defina TOKEN e CLIENT_ID no .env');
  const rest = new REST({ version: '10' }).setToken(token);
  const body = [configCmd.data.toJSON(), painelCmd.data.toJSON(), configBotCmd.data.toJSON(), statsCmd.data.toJSON(), statusCmd.data.toJSON(), pendentesCmd.data.toJSON(), wizCidadeCmd.data.toJSON(), wizBotCmd.data.toJSON(), guiaCmd.data.toJSON()];
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
    console.log('Comandos registrados na guild ' + guildId);
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body });
    console.log('Comandos registrados globalmente');
  }
}

main().catch((e) => {
  console.error('Falha no deploy:', e.message);
  process.exit(1);
});
