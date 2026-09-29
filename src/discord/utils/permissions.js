// feito por: maquinzz
const { PermissionFlagsBits } = require('discord.js');

function isAdmin(member) {
  if (!member) return false;
  try {
    return member.permissions.has(PermissionFlagsBits.Administrator);
  } catch {
    return false;
  }
}

function isGuildInteraction(interaction) {
  return !!(interaction && interaction.guild && interaction.guildId);
}

const cooldowns = new Map();

function checkCooldown(userId, ms) {
  const now = Date.now();
  const last = cooldowns.get(userId) || 0;
  if (now - last < ms) return Math.ceil((ms - (now - last)) / 1000);
  cooldowns.set(userId, now);
  setTimeout(() => {
    if ((cooldowns.get(userId) || 0) <= now) cooldowns.delete(userId);
  }, ms + 5000).unref();
  return 0;
}

const locks = new Map();

function acquireLock(key) {
  if (locks.has(key)) return false;
  locks.set(key, Date.now());
  return true;
}

function releaseLock(key) {
  locks.delete(key);
}

function botCanManageRole(guild, cargoId) {
  const me = guild.members.me;
  if (!me) return { ok: false, motivo: 'Bot ainda iniciando. Tente de novo em segundos.' };
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) return { ok: false, motivo: 'Bot sem permissao Gerenciar Cargos. Ative no cargo do bot.' };
  const cargo = guild.roles.cache.get(cargoId);
  if (!cargo) return { ok: false, motivo: 'Cargo nao encontrado. Configure de novo com /config liberacao.' };
  if (cargo.managed) return { ok: false, motivo: 'Cargo gerenciado por integracao. Escolha um cargo normal.' };
  if (guild.ownerId !== me.id && cargo.position >= me.roles.highest.position) {
    return { ok: false, motivo: 'Cargo acima do cargo do bot. Arraste o cargo do bot para cima na lista de cargos.' };
  }
  return { ok: true };
}

function botCanSend(channel) {
  if (!channel || !channel.isTextBased()) return { ok: false, motivo: 'Canal invalido.' };
  const me = channel.guild ? channel.guild.members.me : null;
  if (!me) return { ok: false, motivo: 'Bot ainda iniciando.' };
  const p = channel.permissionsFor(me);
  if (!p.has(PermissionFlagsBits.ViewChannel)) return { ok: false, motivo: 'Bot sem acesso ao canal.' };
  if (!p.has(PermissionFlagsBits.SendMessages)) return { ok: false, motivo: 'Bot sem permissao de enviar mensagens no canal.' };
  if (!p.has(PermissionFlagsBits.EmbedLinks)) return { ok: false, motivo: 'Bot sem permissao de anexar embeds no canal.' };
  return { ok: true };
}

module.exports = { isAdmin, isGuildInteraction, checkCooldown, acquireLock, releaseLock, botCanManageRole, botCanSend };
