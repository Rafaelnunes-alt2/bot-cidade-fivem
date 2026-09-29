// feito por: maquinzz
const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const store = require('../../store/guildStore');
const { infoEmbed, erroEmbed } = require('../utils/embeds');
const { isAdmin, isGuildInteraction, botCanSend } = require('../utils/permissions');
const { isValidUrl } = require('../utils/validators');
const { enviarAuditoria } = require('../utils/audit');
const { applyPresence } = require('./configbot');
const log = require('../utils/logger');

const wizbControl = new Map();

function expirar(map, k, ms) {
  setTimeout(() => map.delete(k), ms).unref();
}

const data = new SlashCommandBuilder()
  .setName('config-todo-bot')
  .setDescription('Assistente que configura o perfil do bot de uma vez')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

function buildMsg(client, guildId) {
  const cfg = store.getConfig(guildId);
  const b = cfg.bot;
  const pres = (b.status || 'online') + ' | ' + (b.atividadeTexto ? b.atividadeTipo + ' ' + b.atividadeTexto : 'padrao');
  return infoEmbed('Assistente do bot', 'Nome: ' + client.user.username + '\nPresenca salva: ' + pres + '\n\nToque em cada botao e preencha. O painel acima atualiza sozinho.\n\nBio do perfil: peca ao Maquinzz, apenas ele pode alterar.', cfg);
}

function buildRows() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('wizb_nome').setLabel('Nome').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('wizb_avatar').setLabel('Avatar').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('wizb_nick').setLabel('Apelido').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('wizb_status').setLabel('Status').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('wizb_atividade').setLabel('Atividade').setStyle(ButtonStyle.Primary)
  )];
}

async function refreshControl(client, guildId) {
  try {
    const ref = wizbControl.get(guildId);
    if (!ref) return;
    const ch = await client.channels.fetch(ref.channelId).catch(() => null);
    if (!ch) return;
    const msg = await ch.messages.fetch(ref.messageId).catch(() => null);
    if (!msg) return;
    await msg.edit({ embeds: [buildMsg(client, guildId)], components: buildRows() });
  } catch {}
}

async function execute(interaction) {
  if (!isGuildInteraction(interaction)) {
    return interaction.reply({ embeds: [erroEmbed('Use este comando dentro do servidor.', store.getConfig(interaction.guildId))], ephemeral: true });
  }
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ embeds: [erroEmbed('Apenas administradores podem usar este comando.', store.getConfig(interaction.guildId))], ephemeral: true });
  }
  const chk = botCanSend(interaction.channel);
  if (!chk.ok) return interaction.reply({ embeds: [erroEmbed('Nao consigo postar aqui: ' + chk.motivo, store.getConfig(interaction.guildId))], ephemeral: true });
  const msg = await interaction.channel.send({ embeds: [buildMsg(interaction.client, interaction.guildId)], components: buildRows() });
  wizbControl.set(interaction.guildId, { channelId: interaction.channel.id, messageId: msg.id });
  expirar(wizbControl, interaction.guildId, 60 * 60 * 1000);
  return interaction.reply({ embeds: [infoEmbed('Assistente aberto', 'Painel do bot postado em <#' + interaction.channel.id + '>. Rode em canal da staff.', store.getConfig(interaction.guildId))], ephemeral: true });
}

function txt(id, label, style, required, max, value) {
  const t = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(max);
  if (value) t.setValue(String(value).slice(0, max));
  return t;
}

function isValidUsername(v) {
  return /^[a-z0-9_.]{2,32}$/.test(v) && !/[_.]{2,}/.test(v);
}

function isStreamUrl(v) {
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:') return false;
    return /(twitch\.tv|youtube\.com|youtu\.be)$/.test(u.hostname.replace(/^www\./, ''));
  } catch {
    return false;
  }
}

const STATUS_OK = ['online', 'ausente', 'ocupado', 'invisivel'];
const ATIV_OK = ['jogando', 'transmitindo', 'ouvindo', 'assistindo', 'competindo'];

async function handleButton(interaction) {
  const id = interaction.customId;
  if (!['wizb_nome', 'wizb_avatar', 'wizb_nick', 'wizb_status', 'wizb_atividade'].includes(id)) return false;
  if (!isGuildInteraction(interaction)) {
    await interaction.reply({ embeds: [erroEmbed('Use dentro do servidor.', store.getConfig(interaction.guildId))], ephemeral: true });
    return true;
  }
  if (!isAdmin(interaction.member)) {
    await interaction.reply({ embeds: [erroEmbed('Apenas administradores.', store.getConfig(interaction.guildId))], ephemeral: true });
    return true;
  }
  const b = store.getConfig(interaction.guildId).bot;
  const m = new ModalBuilder();
  if (id === 'wizb_nome') {
    m.setCustomId('wizb_m_nome').setTitle('Nome do bot');
    m.addComponents(new ActionRowBuilder().addComponents(txt('nome', 'Minusculas, sem espaco', TextInputStyle.Short, true, 32, interaction.client.user.username)));
  } else if (id === 'wizb_avatar') {
    m.setCustomId('wizb_m_avatar').setTitle('Avatar do bot');
    m.addComponents(new ActionRowBuilder().addComponents(txt('url', 'Link https da imagem', TextInputStyle.Short, true, 300, null)));
  } else if (id === 'wizb_nick') {
    m.setCustomId('wizb_m_nick').setTitle('Apelido do bot');
    m.addComponents([
      txt('nick', 'Novo apelido', TextInputStyle.Short, false, 32, interaction.guild.members.me ? interaction.guild.members.me.nickname : null),
      txt('limpar', 'Escreva limpar para resetar', TextInputStyle.Short, false, 7, null)
    ].map(c => new ActionRowBuilder().addComponents(c)));
  } else if (id === 'wizb_status') {
    m.setCustomId('wizb_m_status').setTitle('Status do bot');
    m.addComponents(new ActionRowBuilder().addComponents(txt('estado', 'online, ausente, ocupado...', TextInputStyle.Short, true, 10, b.status)));
  } else if (id === 'wizb_atividade') {
    m.setCustomId('wizb_m_atividade').setTitle('Atividade do bot');
    m.addComponents([
      txt('tipo', 'Tipo da atividade', TextInputStyle.Short, false, 15, b.atividadeTipo),
      txt('texto', 'Texto da atividade', TextInputStyle.Short, false, 60, b.atividadeTexto),
      txt('url', 'URL twitch/youtube', TextInputStyle.Short, false, 300, b.atividadeUrl),
      txt('limpar', 'Escreva limpar para resetar', TextInputStyle.Short, false, 7, null)
    ].map(c => new ActionRowBuilder().addComponents(c)));
  }
  await interaction.showModal(m);
  return true;
}

async function handleModal(interaction) {
  const id = interaction.customId;
  if (!id.startsWith('wizb_m_')) return false;
  if (!isGuildInteraction(interaction)) {
    await interaction.reply({ embeds: [erroEmbed('Use dentro do servidor.', store.getConfig(interaction.guildId))], ephemeral: true });
    return true;
  }
  if (!isAdmin(interaction.member)) {
    await interaction.reply({ embeds: [erroEmbed('Apenas administradores.', store.getConfig(interaction.guildId))], ephemeral: true });
    return true;
  }
  const guildId = interaction.guildId;
  const g = (n) => (interaction.fields.getTextInputValue(n) || '').trim();
  await interaction.deferReply({ ephemeral: true });
  const done = async () => {
    await refreshControl(interaction.client, guildId);
    await interaction.deleteReply().catch(() => null);
  };

  if (id === 'wizb_m_nome') {
    const nome = g('nome');
    if (!isValidUsername(nome)) {
      await interaction.editReply({ embeds: [erroEmbed('Nome invalido. Apenas letras minusculas, numeros, ponto e underscore, sem espacos.', store.getConfig(guildId))] });
      return true;
    }
    try {
      await interaction.client.user.setUsername(nome);
      const cfg = store.getConfig(guildId);
      await enviarAuditoria(interaction.guild, cfg, 'Assistente bot: nome alterado', interaction.user.id, 'Novo nome: ' + nome);
      await done();
    } catch (e) {
      log.error('wizard nome falhou', e);
      await interaction.editReply({ embeds: [erroEmbed('Nao consegui trocar o nome. O Discord permite 2 trocas por hora.', store.getConfig(guildId))] });
    }
    return true;
  }

  if (id === 'wizb_m_avatar') {
    const url = g('url');
    if (!isValidUrl(url)) {
      await interaction.editReply({ embeds: [erroEmbed('URL invalida. Use link https terminando em png, jpg, jpeg, webp ou gif.', store.getConfig(guildId))] });
      return true;
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error('download');
      const ct = res.headers.get('content-type') || '';
      if (!ct.startsWith('image/')) throw new Error('tipo');
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0 || buf.length > 8 * 1024 * 1024) throw new Error('tamanho');
      await interaction.client.user.setAvatar(buf);
      const cfg = store.getConfig(guildId);
      await enviarAuditoria(interaction.guild, cfg, 'Assistente bot: avatar alterado', interaction.user.id, 'Nova logo aplicada.');
      await done();
    } catch {
      await interaction.editReply({ embeds: [erroEmbed('Nao consegui aplicar a imagem. Confira o link e tente de novo.', store.getConfig(guildId))] });
    }
    return true;
  }

  if (id === 'wizb_m_nick') {
    const limpar = g('limpar').toLowerCase() === 'limpar';
    const nick = g('nick');
    if (!limpar && (nick.length < 1 || nick.length > 32)) {
      await interaction.editReply({ embeds: [erroEmbed('Informe o nick ou escreva limpar.', store.getConfig(guildId))] });
      return true;
    }
    try {
      const me = await interaction.guild.members.fetchMe();
      await me.setNickname(limpar ? null : nick, 'Apelido via assistente');
      const cfg = store.getConfig(guildId);
      await enviarAuditoria(interaction.guild, cfg, 'Assistente bot: nick alterado', interaction.user.id, limpar ? 'Resetado.' : 'Novo nick: ' + nick);
      await done();
    } catch (e) {
      log.error('wizard nick falhou', e);
      await interaction.editReply({ embeds: [erroEmbed('Nao consegui trocar o apelido. Confira a permissao do bot.', store.getConfig(guildId))] });
    }
    return true;
  }

  if (id === 'wizb_m_status') {
    const estado = g('estado').toLowerCase();
    if (!STATUS_OK.includes(estado)) {
      await interaction.editReply({ embeds: [erroEmbed('Estado invalido. Use online, ausente, ocupado ou invisivel.', store.getConfig(guildId))] });
      return true;
    }
    store.setBot(guildId, { status: estado });
    try {
      applyPresence(interaction.client, store.getConfig(guildId).bot);
    } catch {}
    const cfg = store.getConfig(guildId);
    await enviarAuditoria(interaction.guild, cfg, 'Assistente bot: status alterado', interaction.user.id, 'Novo estado: ' + estado);
    await done();
    return true;
  }

  if (id === 'wizb_m_atividade') {
    const limpar = g('limpar').toLowerCase() === 'limpar';
    if (limpar) {
      store.setBot(guildId, { atividadeTipo: null, atividadeTexto: null, atividadeUrl: null });
      try {
        applyPresence(interaction.client, store.getConfig(guildId).bot);
      } catch {}
      const cfg = store.getConfig(guildId);
      await enviarAuditoria(interaction.guild, cfg, 'Assistente bot: atividade resetada', interaction.user.id, 'Padrao.');
      await done();
      return true;
    }
    const tipo = (g('tipo') || 'assistindo').toLowerCase();
    const texto = g('texto');
    const url = g('url');
    if (!ATIV_OK.includes(tipo)) {
      await interaction.editReply({ embeds: [erroEmbed('Tipo invalido. Use jogando, transmitindo, ouvindo, assistindo ou competindo.', store.getConfig(guildId))] });
      return true;
    }
    if (!texto) {
      await interaction.editReply({ embeds: [erroEmbed('Informe o texto da atividade.', store.getConfig(guildId))] });
      return true;
    }
    if (tipo === 'transmitindo' && (!url || !isStreamUrl(url))) {
      await interaction.editReply({ embeds: [erroEmbed('Transmitindo exige URL da twitch ou youtube.', store.getConfig(guildId))] });
      return true;
    }
    store.setBot(guildId, { atividadeTipo: tipo, atividadeTexto: texto, atividadeUrl: tipo === 'transmitindo' ? url : null });
    try {
      applyPresence(interaction.client, store.getConfig(guildId).bot);
    } catch {}
    const cfg = store.getConfig(guildId);
    await enviarAuditoria(interaction.guild, cfg, 'Assistente bot: atividade alterada', interaction.user.id, tipo + ' ' + texto);
    await done();
    return true;
  }

  return false;
}

module.exports = { data, execute, handleButton, handleModal };
