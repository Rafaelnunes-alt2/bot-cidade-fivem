// feito por: maquinzz
require('dotenv').config();
const { loadEnv } = require('./config');
const { createClient } = require('./discord/client');
const log = require('./discord/utils/logger');

process.on('unhandledRejection', (e) => log.error('unhandledRejection', e));
process.on('uncaughtException', (e) => {
  log.error('uncaughtException', e);
  process.exit(1);
});

async function main() {
  const env = loadEnv();
  const client = createClient();
  const shutdown = async () => {
    try {
      log.info('Encerrando...');
      await client.destroy();
    } catch {}
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  await client.login(env.token);
}

main().catch((e) => {
  log.error('Falha ao iniciar', e);
  process.exit(1);
});
