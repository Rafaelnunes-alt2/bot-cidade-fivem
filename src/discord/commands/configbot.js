// feito por: maquinzz
const { SlashCommandBuilder, PermissionFlagsBits, ActivityType } = require('discord.js');
const store = require('../../store/guildStore');
const { infoEmbed, erroEmbed } = require('../utils/embeds');
const { isAdmin, isGuildInteraction } = require('../utils/permissions');
const { isValidUrl } = require('../utils/validators');
const { enviarAuditoria } = require('../utils/audit');
const log = require('../utils/logger');

const STATUS_MAP = { online: 'online', ausente: 'idle', ocupado: 'dnd', invisivel: 'invisible' };
const ATIV_MAP = { jogando: ActivityType.Playing, transmitindo: ActivityType.Streaming, ouvindo: ActivityType.Listening, assistindo: ActivityType.Watching, competindo: ActivityType.Competing };
const ATIV_LABEL = { jogando: 'Jogando', transmitindo: 'Transmitindo', ouvindo: 'Ouvindo', assistindo: 'Assistindo', competindo: 'Competindo' };

function applyPresence(client, bot) {
  const activities = [];
  if (bot && bot.atividadeTexto) {
    const type = ATIV_MAP[bot.atividadeTipo] !== undefined ? ATIV_MAP[bot.atividadeTipo] : ActivityType.Watching;
    const act = { name: bot.atividadeTexto, type };
    if (type === ActivityType.Streaming && bot.atividadeUrl) act.url = bot.atividadeUrl;
    activities.push(act);
  } else {
    activities.push({ name: 'liberacao de ID', type: ActivityType.Watching });
  }
  const status = (bot && STATUS_MAP[bot.status]) || 'online';
  client.user.setPresence({ activities, status });
}

const data = new SlashCommandBuilder()
  .setName('config-bot')
  .setDescription('Personalizar perfil e presença do bot (apenas administradores)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(s => s.setName('ver').setDescription('Ver perfil e presença atuais do bot'))
  .addSubcommand(s => s.setName('nome')
    .setDescription('Trocar o nome global do bot (limite do Discord: 2 por hora)')
    .addStringOption(o => o.setName('nome').setDescription('Novo nome, 2 a 32 letras minusculas sem espaco').setRequired(true).setMaxLength(32)))
  .addSubcommand(s => s.setName('avatar')
    .setDescription('Trocar a logo do bot por anexo ou link')
    .addAttachmentOption(o => o.setName('imagem').setDescription('Arquivo png jpg webp de ate 8MB').setRequired(false))
    .addStringOption(o => o.setName('url').setDescription('Link https direto da imagem').setRequired(false)))
  .addSubcommand(s => s.setName('nick')
    .setDescription('Trocar o apelido do bot neste servidor')
    .addStringOption(o => o.setName('nick').setDescription('Novo apelido de ate 32 caracteres').setRequired(false).setMaxLength(32))
    .addBooleanOption(o => o.setName('limpar').setDescription('Voltar ao nome original').setRequired(false)))
  .addSubcommand(s => s.setName('status')
    .setDescription('Trocar o status online do bot')
    .addStringOption(o => o.setName('estado').setDescription('Estado').setRequired(true)
      .addChoices({ name: 'Online', value: 'online' }, { name: 'Ausente', value: 'ausente' }, { name: 'Ocupado', value: 'ocupado' }, { name: 'Invisivel', value: 'invisivel' })))
  .addSubcommand(s => s.setName('atividade')
    .setDescription('Trocar o texto Jogando/Ouvindo/Assistindo do bot')
    .addStringOption(o => o.setName('tipo').setDescription('Tipo').setRequired(false)
      .addChoices({ name: 'Jogando', value: 'jogando' }, { name: 'Transmitindo', value: 'transmitindo' }, { name: 'Ouvindo', value: 'ouvindo' }, { name: 'Assistindo', value: 'assistindo' }, { name: 'Competindo', value: 'competindo' }))
    .addStringOption(o => o.setName('texto').setDescription('Texto de ate 60 caracteres').setRequired(false).setMaxLength(60))
    .addStringOption(o => o.setName('url').setDescription('Obrigatorio so para Transmitindo, link twitch ou youtube').setRequired(false))
    .addBooleanOption(o => o.setName('limpar').setDescription('Voltar ao padrao').setRequired(false)));

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

async function loadAvatarBytes(interaction) {
  const anexo = interaction.options.getAttachment('imagem');
  const url = interaction.options.getString('url');
  if (!anexo && !url) return { erro: 'Envie a imagem como anexo ou informe a url.' };
  if (anexo && url) return { erro: 'Envie apenas um: anexo ou url, nao os dois.' };
  if (anexo) {
    if (!anexo.contentType || !anexo.contentType.startsWith('image/')) return { erro: 'Anexo invalido. Envie png, jpg ou webp.' };
    if (anexo.size > 8 * 1024 * 1024) return { erro: 'Imagem maior que 8MB.' };
    const res = await fetch(anexo.url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { erro: 'Nao consegui baixar o anexo.' };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 8 * 1024 * 1024) return { erro: 'Imagem maior que 8MB.' };
    return { bytes: buf };
  }
  if (!isValidUrl(url)) return { erro: 'URL invalida. Use link https terminando em png, jpg, jpeg, webp ou gif.' };
  const res = await fetch(url.trim(), { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return { erro: 'Nao consegui baixar a imagem do link.' };
  const ct = res.headers.get('content-type') || '';
  if (!ct.startsWith('image/')) return { erro: 'O link nao retornou uma imagem.' };
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0 || buf.length > 8 * 1024 * 1024) return { erro: 'Imagem invalida ou maior que 8MB.' };
  return { bytes: buf };
}

async function execute(interaction) {
  if (!isGuildInteraction(interaction)) {
    return interaction.reply({ embeds: [erroEmbed('Use este comando dentro do servidor.', store.getConfig(interaction.guildId))], ephemeral: true });
  }
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ embeds: [erroEmbed('Apenas administradores podem usar este comando.', store.getConfig(interaction.guildId))], ephemeral: true });
  }
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (sub === 'ver') {
    const cfg = store.getConfig(guildId);
    const me = interaction.guild.members.me;
    const nick = me ? me.nickname || 'nenhum' : 'desconhecido';
    const b = cfg.bot;
    const pres = (b.status || 'online') + ' | ' + (b.atividadeTexto ? ((ATIV_LABEL[b.atividadeTipo] || 'Assistindo') + ' ' + b.atividadeTexto) : 'padrao');
    return interaction.reply({
      embeds: [infoEmbed('Perfil do bot', 'Nome: ' + interaction.client.user.username + '\nApelido aqui: ' + nick + '\nPresenca: ' + pres + '\n\nBio do perfil: peca ao Maquinzz, apenas ele pode alterar.', cfg)],
      ephemeral: true
    });
  }

  if (sub === 'nome') {
    const nome = String(interaction.options.getString('nome') || '').trim();
    if (!isValidUsername(nome)) {
      return interaction.reply({ embeds: [erroEmbed('Nome invalido. Use 2 a 32 caracteres, apenas letras minusculas, numeros, ponto e underscore, sem espacos.', store.getConfig(interaction.guildId))], ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      await interaction.client.user.setUsername(nome);
      const cfg = store.getConfig(guildId);
      await enviarAuditoria(interaction.guild, cfg, 'Nome do bot alterado', interaction.user.id, 'Novo nome: ' + nome);
      return interaction.editReply({ embeds: [infoEmbed('Nome atualizado', 'O bot agora se chama ' + nome + '.', cfg)] });
    } catch (e) {
      log.error('setUsername falhou', e);
      return interaction.editReply({ embeds: [erroEmbed('Nao consegui trocar o nome. O Discord permite 2 trocas por hora, aguarde e tente de novo.', store.getConfig(interaction.guildId))] });
    }
  }

  if (sub === 'avatar') {
    await interaction.deferReply({ ephemeral: true });
    let bytes;
    try {
      const r = await loadAvatarBytes(interaction);
      if (r.erro) return interaction.editReply({ embeds: [erroEmbed(r.erro, store.getConfig(interaction.guildId))] });
      bytes = r.bytes;
    } catch {
      return interaction.editReply({ embeds: [erroEmbed('Nao consegui baixar a imagem. Tente outro link ou anexo.', store.getConfig(interaction.guildId))] });
    }
    try {
      await interaction.client.user.setAvatar(bytes);
      const cfg = store.getConfig(guildId);
      await enviarAuditoria(interaction.guild, cfg, 'Avatar do bot alterado', interaction.user.id, 'Nova logo aplicada.');
      return interaction.editReply({ embeds: [infoEmbed('Avatar atualizado', 'Nova logo do bot aplicada com sucesso.', cfg)] });
    } catch (e) {
      log.error('setAvatar falhou', e);
      return interaction.editReply({ embeds: [erroEmbed('Nao consegui trocar o avatar. Aguarde alguns minutos e tente de novo.', store.getConfig(interaction.guildId))] });
    }
  }

  if (sub === 'nick') {
    const limpar = interaction.options.getBoolean('limpar') || false;
    const nick = interaction.options.getString('nick');
    if (!limpar && !nick) return interaction.reply({ embeds: [erroEmbed('Informe o nick ou marque limpar.', store.getConfig(interaction.guildId))], ephemeral: true });
    if (nick && (nick.trim().length < 1 || nick.trim().length > 32)) return interaction.reply({ embeds: [erroEmbed('Nick de 1 a 32 caracteres.', store.getConfig(interaction.guildId))], ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    try {
      const me = await interaction.guild.members.fetchMe();
      await me.setNickname(limpar ? null : nick.trim(), 'Nick alterado via config-bot');
      const cfg = store.getConfig(guildId);
      await enviarAuditoria(interaction.guild, cfg, 'Nick do bot alterado', interaction.user.id, limpar ? 'Voltou ao original.' : 'Novo nick: ' + nick.trim());
      return interaction.editReply({ embeds: [infoEmbed('Nick atualizado', limpar ? 'Apelido removido, voltou ao original.' : 'Novo apelido: ' + nick.trim(), cfg)] });
    } catch (e) {
      log.error('setNickname falhou', e);
      return interaction.editReply({ embeds: [erroEmbed('Nao consegui trocar o apelido. Confira se o bot tem permissao de trocar apelido.', store.getConfig(interaction.guildId))] });
    }
  }

  if (sub === 'status') {
    const estado = interaction.options.getString('estado');
    store.setBot(guildId, { status: estado });
    try {
      applyPresence(interaction.client, store.getConfig(guildId).bot);
    } catch (e) {
      log.warn('Falha ao aplicar presence: ' + e.message);
    }
    const cfg = store.getConfig(guildId);
    await enviarAuditoria(interaction.guild, cfg, 'Status do bot alterado', interaction.user.id, 'Novo estado: ' + estado);
    return interaction.reply({ embeds: [infoEmbed('Status atualizado', 'Novo estado: ' + estado, cfg)], ephemeral: true });
  }

  if (sub === 'atividade') {
    const limpar = interaction.options.getBoolean('limpar') || false;
    const tipo = interaction.options.getString('tipo') || 'assistindo';
    const texto = interaction.options.getString('texto');
    const url = interaction.options.getString('url');
    if (limpar) {
      store.setBot(guildId, { atividadeTipo: null, atividadeTexto: null, atividadeUrl: null });
      try {
        applyPresence(interaction.client, store.getConfig(guildId).bot);
      } catch {}
      const cfg = store.getConfig(guildId);
      await enviarAuditoria(interaction.guild, cfg, 'Atividade do bot resetada', interaction.user.id, 'Voltou ao padrao.');
      return interaction.reply({ embeds: [infoEmbed('Atividade resetada', 'Voltou ao padrao.', cfg)], ephemeral: true });
    }
    if (!texto || texto.trim().length < 1) return interaction.reply({ embeds: [erroEmbed('Informe o texto da atividade.', store.getConfig(interaction.guildId))], ephemeral: true });
    if (tipo === 'transmitindo') {
      if (!url || !isStreamUrl(url)) return interaction.reply({ embeds: [erroEmbed('Transmitindo exige url da twitch ou youtube.', store.getConfig(interaction.guildId))], ephemeral: true });
    }
    store.setBot(guildId, { atividadeTipo: tipo, atividadeTexto: texto.trim(), atividadeUrl: tipo === 'transmitindo' ? url.trim() : null });
    try {
      applyPresence(interaction.client, store.getConfig(guildId).bot);
    } catch (e) {
      log.warn('Falha ao aplicar presence: ' + e.message);
    }
    const cfg = store.getConfig(guildId);
    await enviarAuditoria(interaction.guild, cfg, 'Atividade do bot alterada', interaction.user.id, (ATIV_LABEL[tipo] || tipo) + ' ' + texto.trim());
    return interaction.reply({ embeds: [infoEmbed('Atividade atualizada', (ATIV_LABEL[tipo] || tipo) + ' ' + texto.trim(), cfg)], ephemeral: true });
  }
}

module.exports = { data, execute, applyPresence };
