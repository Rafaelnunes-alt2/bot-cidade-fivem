// feito por: maquinzz
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const configCmd = require('./commands/config');
const painelCmd = require('./commands/painel');
const configBotCmd = require('./commands/configbot');
const statsCmd = require('./commands/stats');
const statusCmd = require('./commands/status');
const pendentesCmd = require('./commands/pendentes');
const wizCidadeCmd = require('./commands/wizardCidade');
const wizBotCmd = require('./commands/wizardBot');
const guiaCmd = require('./commands/guia');
const { onReady } = require('./events/ready');
const { onGuildMemberRemove } = require('./events/guildMemberRemove');
const { buildHandler } = require('./events/interactionCreate');

function createClient() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
  const commands = new Collection();
  commands.set(configCmd.data.name, configCmd);
  commands.set(painelCmd.data.name, painelCmd);
  commands.set(configBotCmd.data.name, configBotCmd);
  commands.set(statsCmd.data.name, statsCmd);
  commands.set(statusCmd.data.name, statusCmd);
  commands.set(pendentesCmd.data.name, pendentesCmd);
  commands.set(wizCidadeCmd.data.name, wizCidadeCmd);
  commands.set(wizBotCmd.data.name, wizBotCmd);
  commands.set(guiaCmd.data.name, guiaCmd);
  client.once('ready', () => onReady(client));
  client.on('guildMemberRemove', onGuildMemberRemove);
  client.on('interactionCreate', buildHandler(commands));
  client.on('error', () => {});
  return client;
}

module.exports = { createClient };
