// feito por: maquinzz
const now = () => new Date().toISOString();

function info(msg) {
  console.log('[' + now() + '] ' + msg);
}

function warn(msg) {
  console.warn('[' + now() + '] ' + msg);
}

function error(msg, e) {
  if (e) console.error('[' + now() + '] ' + msg, String((e && e.message) || e));
  else console.error('[' + now() + '] ' + msg);
}

module.exports = { info, warn, error };
