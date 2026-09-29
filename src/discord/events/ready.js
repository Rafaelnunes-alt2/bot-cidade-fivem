// feito por: maquinzz
const { ActivityType } = require('discord.js');
const { getAnyPresence } = require('../../store/guildStore');
const { applyPresence } = require('../commands/configbot');
const log = require('../utils/logger');

async function onReady(client) {
  log.info('Bot online como ' + client.user.tag + ' | feito por: maquinzz');
  try {
    const saved = getAnyPresence();
    if (saved && (saved.status || saved.atividadeTexto)) {
      applyPresence(client, saved);
    } else {
      client.user.setPresence({
        activities: [{ name: 'liberacao de ID', type: ActivityType.Watching }],
        status: 'online'
      });
    }
  } catch {}
}

module.exports = { onReady };
