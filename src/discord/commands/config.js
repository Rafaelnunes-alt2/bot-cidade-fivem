// feito por: maquinzz
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const store = require('../../store/guildStore');
const { testConnection, sampleIds, findRegistro, revogarId } = require('../../database/manager');
const { infoEmbed, erroEmbed, statusConfigEmbed, consultaEmbed } = require('../utils/embeds');
const { isAdmin, isGuildInteraction, botCanManageRole, botCanSend } = require('../utils/permissions');
const { isValidUrl, normalizeColor, isValidHost, isValidPort, isValidSqlIdent, isValidDbName, isValidDbUser, isValidGameId, friendlyDbError } = require('../utils/validators');
const { enviarAuditoria } = require('../utils/audit');
const { refreshPainel } = require('./painel');
const log = require('../utils/logger');

function painelNota(ref) {
  if (!ref) return '';
  if (ref.ok && ref.modo === 'editado') return '\n\nPainel atualizado automaticamente.';
  if (ref.ok && ref.modo === 'republicado') return '\n\nPainel antigo nao existia mais, publiquei um novo automaticamente.';
  if (ref.motivo === 'sem_painel') return '';
  return '\n\nNao consegui atualizar o painel sozinho, rode /painel.';
}

const pendingBanco = new Map();

function getPending(key) {
  return pendingBanco.get(key) || null;
}

function setPending(key, val) {
  pendingBanco.set(key, { ...val, ts: Date.now() });
  setTimeout(() => pendingBanco.delete(key), 5 * 60 * 1000).unref();
}

const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('Configurar o bot da cidade (apenas administradores)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(s => s.setName('cidade')
    .setDescription('Definir nome, logo e identidade da cidade')
    .addStringOption(o => o.setName('nome').setDescription('Nome da cidade').setRequired(false).setMaxLength(60))
    .addStringOption(o => o.setName('logo').setDescription('Link https direto da logo png jpg webp').setRequired(false))
    .addBooleanOption(o => o.setName('mostrar-logo').setDescription('Exibir a logo no painel').setRequired(false))
    .addStringOption(o => o.setName('banner').setDescription('Link https da imagem grande do painel').setRequired(false))
    .addBooleanOption(o => o.setName('mostrar-banner').setDescription('Exibir o banner no painel').setRequired(false))
    .addBooleanOption(o => o.setName('mostrar-creditos').setDescription('Exibir o credito no rodape').setRequired(false))
    .addStringOption(o => o.setName('cor').setDescription('Cor do embed ex #22C55E').setRequired(false))
    .addStringOption(o => o.setName('descricao').setDescription('Texto base do painel').setRequired(false).setMaxLength(1500)))
  .addSubcommand(s => s.setName('banco')
    .setDescription('Configurar acesso ao banco da cidade FiveM')
    .addStringOption(o => o.setName('tipo').setDescription('mysql ou postgres').setRequired(true).addChoices({ name: 'MySQL / MariaDB (HeidiSQL)', value: 'mysql' }, { name: 'PostgreSQL (Supabase)', value: 'postgres' }))
    .addStringOption(o => o.setName('host').setDescription('IP ou host do banco').setRequired(true))
    .addIntegerOption(o => o.setName('porta').setDescription('Porta: 3306 mysql, 5432 postgres').setRequired(true))
    .addStringOption(o => o.setName('usuario').setDescription('Usuario do banco').setRequired(true))
    .addStringOption(o => o.setName('database').setDescription('Nome do database').setRequired(true))
    .addStringOption(o => o.setName('tabela').setDescription('Tabela da whitelist ex users').setRequired(true))
    .addStringOption(o => o.setName('coluna-id').setDescription('Coluna do ID do jogador ex id').setRequired(true))
    .addStringOption(o => o.setName('coluna-status').setDescription('Coluna da liberacao ex whitelisted').setRequired(true))
    .addStringOption(o => o.setName('valor-liberado').setDescription('Valor que libera ex 1 ou true').setRequired(true))
    .addBooleanOption(o => o.setName('ssl').setDescription('Usar SSL (Supabase = true)').setRequired(false))
    .addStringOption(o => o.setName('valor-bloqueado').setDescription('Valor bloqueado ex 0 ou false').setRequired(false))
    .addStringOption(o => o.setName('coluna-nome').setDescription('Opcional: coluna do nome ex name').setRequired(false)))
  .addSubcommand(s => s.setName('liberacao')
    .setDescription('Definir cargo, logs e textos do painel')
    .addRoleOption(o => o.setName('cargo').setDescription('Cargo dado apos liberar o ID').setRequired(false))
    .addChannelOption(o => o.setName('canal-logs').setDescription('Canal de logs').setRequired(false).addChannelTypes(ChannelType.GuildText))
    .addStringOption(o => o.setName('titulo').setDescription('Titulo do painel').setRequired(false).setMaxLength(120))
    .addStringOption(o => o.setName('descricao').setDescription('Descricao do painel').setRequired(false).setMaxLength(1800))
    .addStringOption(o => o.setName('texto-botao').setDescription('Texto do botao verde').setRequired(false).setMaxLength(40))
    .addIntegerOption(o => o.setName('max-ids').setDescription('Limite de IDs por conta, 0 ilimitado').setRequired(false).setMinValue(0).setMaxValue(10))
    .addStringOption(o => o.setName('ip-servidor').setDescription('IP de conexao ex connect 1.2.3.4:30120').setRequired(false).setMaxLength(100))
    .addStringOption(o => o.setName('instrucoes').setDescription('Mensagem enviada na DM apos liberar').setRequired(false).setMaxLength(500))
    .addBooleanOption(o => o.setName('revogar-ao-sair').setDescription('Revogar ID de quem sair do Discord').setRequired(false)))
  .addSubcommand(s => s.setName('servidor')
    .setDescription('Definir IP do servidor FiveM para o /status')
    .addStringOption(o => o.setName('ip').setDescription('IP ou host do servidor FiveM').setRequired(true))
    .addIntegerOption(o => o.setName('porta').setDescription('Porta, geralmente 30120').setRequired(true))
    .addBooleanOption(o => o.setName('limpar').setDescription('Remover configuracao').setRequired(false)))
  .addSubcommand(s => s.setName('exportar').setDescription('Baixar CSV com todos os IDs liberados'))
  .addSubcommand(s => s.setName('ver').setDescription('Ver configuracao atual sem expor a senha'))
  .addSubcommand(s => s.setName('testar').setDescription('Testar conexao com o banco e validar tabela'))
  .addSubcommand(s => s.setName('consultar').setDescription('Consultar situacao de um ID no banco')
    .addStringOption(o => o.setName('id').setDescription('ID do jogador').setRequired(true).setMaxLength(6)))
  .addSubcommand(s => s.setName('revogar').setDescription('Revogar liberacao de um ID e remover o cargo')
    .addStringOption(o => o.setName('id').setDescription('ID do jogador').setRequired(true).setMaxLength(6))
    .addUserOption(o => o.setName('usuario').setDescription('Usuario do Discord para remover o cargo').setRequired(false)))
  .addSubcommand(s => s.setName('remover-banco').setDescription('Apagar credenciais do banco deste servidor'));

function buildSenhaModal() {
  const modal = new ModalBuilder().setCustomId('config_senha_modal').setTitle('Senha do banco');
  const senha = new TextInputBuilder()
    .setCustomId('db_senha')
    .setLabel('Senha do banco de dados')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Cole a senha do banco')
    .setRequired(true).setMinLength(1).setMaxLength(200);
  modal.addComponents(new ActionRowBuilder().addComponents(senha));
  return modal;
}

async function execute(interaction) {
  if (!isGuildInteraction(interaction)) {
    return interaction.reply({ embeds: [erroEmbed('Use este comando dentro do servidor da cidade.', store.getConfig(interaction.guildId))], ephemeral: true });
  }
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ embeds: [erroEmbed('Apenas administradores podem usar este comando.', store.getConfig(interaction.guildId))], ephemeral: true });
  }
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (sub === 'cidade') {
    const nome = interaction.options.getString('nome');
    const logo = interaction.options.getString('logo');
    const mostrarLogo = interaction.options.getBoolean('mostrar-logo');
    const banner = interaction.options.getString('banner');
    const mostrarBanner = interaction.options.getBoolean('mostrar-banner');
    const mostrarCreditos = interaction.options.getBoolean('mostrar-creditos');
    const cor = interaction.options.getString('cor');
    const descricao = interaction.options.getString('descricao');
    if (!nome && !logo && mostrarLogo === null && !banner && mostrarBanner === null && mostrarCreditos === null && !cor && !descricao) {
      return interaction.reply({ embeds: [erroEmbed('Informe ao menos um campo: nome, logo, banner, cor ou descricao.', store.getConfig(interaction.guildId))], ephemeral: true });
    }
    if (logo && !isValidUrl(logo)) return interaction.reply({ embeds: [erroEmbed('Logo invalida. Use link https direto terminando em png, jpg, jpeg, webp ou gif.', store.getConfig(interaction.guildId))], ephemeral: true });
    if (banner && !isValidUrl(banner)) return interaction.reply({ embeds: [erroEmbed('Banner invalido. Use link https direto terminando em png, jpg, jpeg, webp ou gif.', store.getConfig(interaction.guildId))], ephemeral: true });
    let corNorm;
    if (cor) {
      corNorm = normalizeColor(cor);
      if (!corNorm) return interaction.reply({ embeds: [erroEmbed('Cor invalida. Use formato #22C55E.', store.getConfig(interaction.guildId))], ephemeral: true });
    }
    const cfg = store.setCidade(guildId, { ...(nome ? { nome: nome.trim() } : {}), ...(logo ? { logo: logo.trim() } : {}), ...(mostrarLogo !== null ? { mostrarLogo } : {}), ...(banner ? { banner: banner.trim() } : {}), ...(mostrarBanner !== null ? { mostrarBanner } : {}), ...(mostrarCreditos !== null ? { mostrarCreditos } : {}), ...(corNorm ? { cor: corNorm } : {}), ...(descricao ? { descricao } : {}) });
    await enviarAuditoria(interaction.guild, cfg, 'Cidade atualizada', interaction.user.id, 'Nome: ' + (cfg.cidade.nome || 'nao definido'));
    const ref = await refreshPainel(interaction.guild, guildId);
    return interaction.reply({ embeds: [infoEmbed('Cidade atualizada', 'Nome: ' + (cfg.cidade.nome || 'nao definido') + '\nLogo: ' + (cfg.cidade.logo ? 'definida' : 'nao definida') + '\nBanner: ' + (cfg.cidade.banner ? 'definido' : 'nao definido') + painelNota(ref), cfg)], ephemeral: true });
  }

  if (sub === 'banco') {
    const tipo = interaction.options.getString('tipo');
    const host = String(interaction.options.getString('host') || '').trim();
    const porta = interaction.options.getInteger('porta');
    const usuario = String(interaction.options.getString('usuario') || '').trim();
    const database = String(interaction.options.getString('database') || '').trim();
    const ssl = interaction.options.getBoolean('ssl') || false;
    const tabela = String(interaction.options.getString('tabela') || '').trim();
    const colunaId = String(interaction.options.getString('coluna-id') || '').trim();
    const colunaStatus = String(interaction.options.getString('coluna-status') || '').trim();
    const valorLiberado = interaction.options.getString('valor-liberado');
    const valorBloqueado = interaction.options.getString('valor-bloqueado');
    const colunaNome = interaction.options.getString('coluna-nome') ? String(interaction.options.getString('coluna-nome')).trim() : null;
    if (!isValidHost(host)) return interaction.reply({ embeds: [erroEmbed('Host invalido.', store.getConfig(interaction.guildId))], ephemeral: true });
    if (!isValidPort(porta)) return interaction.reply({ embeds: [erroEmbed('Porta invalida. MySQL usa 3306, Postgres usa 5432.', store.getConfig(interaction.guildId))], ephemeral: true });
    if (!isValidDbUser(usuario)) return interaction.reply({ embeds: [erroEmbed('Usuario do banco invalido.', store.getConfig(interaction.guildId))], ephemeral: true });
    if (!isValidDbName(database)) return interaction.reply({ embeds: [erroEmbed('Database invalido.', store.getConfig(interaction.guildId))], ephemeral: true });
    if (!isValidSqlIdent(tabela) || !isValidSqlIdent(colunaId) || !isValidSqlIdent(colunaStatus)) {
      return interaction.reply({ embeds: [erroEmbed('Tabela ou colunas invalidas. Use apenas letras, numeros e underscore, sem espacos.', store.getConfig(interaction.guildId))], ephemeral: true });
    }
    if (colunaNome && !isValidSqlIdent(colunaNome)) return interaction.reply({ embeds: [erroEmbed('Coluna de nome invalida.', store.getConfig(interaction.guildId))], ephemeral: true });
    setPending(interaction.user.id + ':' + guildId, { tipo, host, porta, usuario, database, ssl, tabela, colunaId, colunaStatus, colunaNome, valorLiberado, valorBloqueado });
    await interaction.showModal(buildSenhaModal());
    return;
  }

  if (sub === 'liberacao') {
    const cargo = interaction.options.getRole('cargo');
    const canal = interaction.options.getChannel('canal-logs');
    const titulo = interaction.options.getString('titulo');
    const descricao = interaction.options.getString('descricao');
    const textoBotao = interaction.options.getString('texto-botao');
    const maxIds = interaction.options.getInteger('max-ids');
    const ipServidor = interaction.options.getString('ip-servidor');
    const instrucoes = interaction.options.getString('instrucoes');
    const revogarAoSair = interaction.options.getBoolean('revogar-ao-sair');
    if (!cargo && !canal && !titulo && !descricao && !textoBotao && maxIds === null && !ipServidor && !instrucoes && revogarAoSair === null) {
      return interaction.reply({ embeds: [erroEmbed('Informe ao menos um campo.', store.getConfig(interaction.guildId))], ephemeral: true });
    }
    if (cargo) {
      const chk = botCanManageRole(interaction.guild, cargo.id);
      if (!chk.ok) return interaction.reply({ embeds: [erroEmbed(chk.motivo, store.getConfig(interaction.guildId))], ephemeral: true });
    }
    if (canal) {
      const chk = botCanSend(canal);
      if (!chk.ok) return interaction.reply({ embeds: [erroEmbed('Canal de logs: ' + chk.motivo, store.getConfig(interaction.guildId))], ephemeral: true });
    }
    const cfg = store.setLiberacao(guildId, {
      ...(cargo ? { cargoId: cargo.id } : {}),
      ...(canal ? { canalLogsId: canal.id } : {}),
      ...(titulo ? { titulo } : {}),
      ...(descricao ? { descricao } : {}),
      ...(textoBotao ? { textoBotao } : {}),
      ...(maxIds !== null ? { maxIds } : {}),
      ...(ipServidor ? { ipServidor: ipServidor.trim() } : {}),
      ...(instrucoes ? { instrucoes } : {}),
      ...(revogarAoSair !== null ? { revogarAoSair } : {})
    });
    await enviarAuditoria(interaction.guild, cfg, 'Liberacao configurada', interaction.user.id, 'Cargo: ' + (cfg.liberacao.cargoId ? '<@&' + cfg.liberacao.cargoId + '>' : 'nao definido'));
    const ref2 = await refreshPainel(interaction.guild, guildId);
    return interaction.reply({ embeds: [infoEmbed('Liberacao configurada', 'Cargo: ' + (cfg.liberacao.cargoId ? '<@&' + cfg.liberacao.cargoId + '>' : 'nao definido') + '\nLogs: ' + (cfg.liberacao.canalLogsId ? '<#' + cfg.liberacao.canalLogsId + '>' : 'nao definido') + painelNota(ref2), cfg)], ephemeral: true });
  }

  if (sub === 'ver') {
    const cfg = store.getConfig(guildId);
    if (store.senhaPrecisaReconfigurar(guildId)) {
      return interaction.reply({ embeds: [erroEmbed('A SECRET_KEY foi trocada e a senha salva nao pode ser lida. Rode /config banco de novo.', store.getConfig(interaction.guildId))], ephemeral: true });
    }
    return interaction.reply({ embeds: [statusConfigEmbed(cfg)], ephemeral: true });
  }

  if (sub === 'testar') {
    await interaction.deferReply({ ephemeral: true });
    try {
      const banco = store.getBancoComSenha(guildId);
      if (!banco.senha) {
        return interaction.editReply({ embeds: [erroEmbed('Banco sem senha. Rode /config banco e informe a senha no modal.', store.getConfig(interaction.guildId)) ] });
      }
      await testConnection(banco);
      const cfg = store.getConfig(guildId);
      let extra = banco.tipo + ' | ' + banco.host + ':' + banco.porta + ' | ' + banco.database + '.' + banco.tabela;
      try {
        const rows = await sampleIds(banco, 5);
        if (rows && rows.length > 0) {
          extra += '\n\nUltimos IDs na tabela: ' + rows.map(r => String(r.id)).join(', ') + '\nConfira se esses numeros batem com o ID da tela do jogo.';
        }
      } catch {}
      return interaction.editReply({ embeds: [infoEmbed('Banco OK', 'Conexao e tabela validadas.\n' + extra, cfg)] });
    } catch (e) {
      log.error('Teste de banco falhou', e);
      return interaction.editReply({ embeds: [erroEmbed('Falha no teste: ' + friendlyDbError(e), store.getConfig(interaction.guildId))] });
    }
  }

  if (sub === 'consultar') {
    await interaction.deferReply({ ephemeral: true });
    const gameId = String(interaction.options.getString('id') || '').trim();
    if (!isValidGameId(gameId)) return interaction.editReply({ embeds: [erroEmbed('ID invalido. Use numero de 1 a 999999.', store.getConfig(interaction.guildId))] });
    try {
      const banco = store.getBancoComSenha(guildId);
      if (!banco.senha) return interaction.editReply({ embeds: [erroEmbed('Banco nao configurado. Rode /config banco.', store.getConfig(interaction.guildId))] });
      const reg = await findRegistro(banco, gameId);
      const dono = store.buscarLiberadoPorGame(guildId, gameId);
      const cfg = store.getConfig(guildId);
      return interaction.editReply({ embeds: [consultaEmbed(cfg, gameId, reg, dono)] });
    } catch (e) {
      log.error('Consulta falhou', e);
      return interaction.editReply({ embeds: [erroEmbed('Falha na consulta: ' + friendlyDbError(e), store.getConfig(interaction.guildId))] });
    }
  }

  if (sub === 'revogar') {
    await interaction.deferReply({ ephemeral: true });
    const gameId = String(interaction.options.getString('id') || '').trim();
    const alvo = interaction.options.getUser('usuario');
    if (!isValidGameId(gameId)) return interaction.editReply({ embeds: [erroEmbed('ID invalido. Use numero de 1 a 999999.', store.getConfig(interaction.guildId))] });
    try {
      const banco = store.getBancoComSenha(guildId);
      if (!banco.senha) return interaction.editReply({ embeds: [erroEmbed('Banco nao configurado. Rode /config banco.', store.getConfig(interaction.guildId))] });
      const res = await revogarId(banco, gameId);
      store.removerLiberado(guildId, gameId);
      if (alvo && store.getConfig(guildId).liberacao.cargoId) {
        try {
          const m = await interaction.guild.members.fetch(alvo.id);
          await m.roles.remove(store.getConfig(guildId).liberacao.cargoId, 'ID revogado');
        } catch {}
      }
      const cfg = store.getConfig(guildId);
      await enviarAuditoria(interaction.guild, cfg, 'ID revogado', interaction.user.id, 'ID: ' + gameId + ' afetados: ' + res.afetados);
      return interaction.editReply({ embeds: [infoEmbed('ID revogado', 'ID ' + gameId + ' revogado. Registros afetados: ' + res.afetados, cfg)] });
    } catch (e) {
      log.error('Revogar falhou', e);
      return interaction.editReply({ embeds: [erroEmbed('Falha ao revogar: ' + friendlyDbError(e), store.getConfig(interaction.guildId))] });
    }
  }

  if (sub === 'servidor') {
    const limpar = interaction.options.getBoolean('limpar') || false;
    if (limpar) {
      const cfg = store.setServidor(guildId, { ip: null, porta: null });
      return interaction.reply({ embeds: [infoEmbed('Servidor removido', 'Status do FiveM desativado.', cfg)], ephemeral: true });
    }
    const ip = String(interaction.options.getString('ip') || '').trim();
    const porta = interaction.options.getInteger('porta');
    if (!isValidHost(ip)) return interaction.reply({ embeds: [erroEmbed('IP invalido.', store.getConfig(interaction.guildId))], ephemeral: true });
    if (!isValidPort(porta)) return interaction.reply({ embeds: [erroEmbed('Porta invalida. Geralmente 30120.', store.getConfig(interaction.guildId))], ephemeral: true });
    const cfg = store.setServidor(guildId, { ip, porta });
    await enviarAuditoria(interaction.guild, cfg, 'Servidor FiveM configurado', interaction.user.id, ip + ':' + porta);
    return interaction.reply({ embeds: [infoEmbed('Servidor configurado', 'FiveM em ' + ip + ':' + porta + '. Use /status para testar.', cfg)], ephemeral: true });
  }

  if (sub === 'exportar') {
    await interaction.deferReply({ ephemeral: true });
    const rows = store.listarLiberados(guildId, 1000);
    const head = 'game_id,discord_id,nome_player,criado_em\n';
    const body = rows.map(r => [r.game_id, r.discord_id, '"' + String(r.nome_player).replace(/"/g, '""') + '"', new Date(r.created_at).toISOString()].join(',')).join('\n');
    const file = Buffer.from(head + body, 'utf8');
    const cfg = store.getConfig(guildId);
    await enviarAuditoria(interaction.guild, cfg, 'Exportacao CSV', interaction.user.id, rows.length + ' registros.');
    return interaction.editReply({ content: rows.length + ' registros exportados.', files: [{ attachment: file, name: 'liberados.csv' }] });
  }

  if (sub === 'remover-banco') {
    store.clearBanco(guildId);
    pendingBanco.delete(interaction.user.id + ':' + guildId);
    const cfg = store.getConfig(guildId);
    await enviarAuditoria(interaction.guild, cfg, 'Banco removido', interaction.user.id, 'Credenciais apagadas.');
    return interaction.reply({ embeds: [infoEmbed('Banco removido', 'Credenciais apagadas deste servidor.', cfg)], ephemeral: true });
  }
}

async function handleSenhaModal(interaction) {
  if (interaction.customId !== 'config_senha_modal') return false;
  if (!isGuildInteraction(interaction)) {
    await interaction.reply({ embeds: [erroEmbed('Use este comando dentro do servidor.', store.getConfig(interaction.guildId))], ephemeral: true });
    return true;
  }
  if (!isAdmin(interaction.member)) {
    await interaction.reply({ embeds: [erroEmbed('Apenas administradores.', store.getConfig(interaction.guildId))], ephemeral: true });
    return true;
  }
  const key = interaction.user.id + ':' + interaction.guildId;
  const pend = getPending(key);
  if (!pend) {
    await interaction.reply({ embeds: [erroEmbed('Sessao expirada. Rode /config banco de novo.', store.getConfig(interaction.guildId))], ephemeral: true });
    return true;
  }
  const senha = (interaction.fields.getTextInputValue('db_senha') || '').trim();
  if (!senha) {
    await interaction.reply({ embeds: [erroEmbed('Senha vazia.', store.getConfig(interaction.guildId))], ephemeral: true });
    return true;
  }
  await interaction.deferReply({ ephemeral: true });
  store.setBanco(interaction.guildId, { ...pend, senha });
  pendingBanco.delete(key);
  try {
    const banco = store.getBancoComSenha(interaction.guildId);
    await testConnection(banco);
    const cfg = store.getConfig(interaction.guildId);
    await enviarAuditoria(interaction.guild, cfg, 'Banco configurado', interaction.user.id, 'Tipo: ' + pend.tipo + ' tabela: ' + pend.tabela);
    await interaction.editReply({ embeds: [infoEmbed('Banco configurado', 'Conexao validada com sucesso.\nTipo: ' + pend.tipo + '\nTabela: ' + pend.tabela + ' (' + pend.colunaId + ' / ' + pend.colunaStatus + ')', cfg)] });
  } catch (e) {
    log.error('Conexao do banco falhou apos salvar', e);
    await interaction.editReply({ embeds: [erroEmbed('Dados salvos, mas a conexao falhou: ' + friendlyDbError(e) + '\n\nConfira IP liberado, porta, usuario e se a tabela existe. A senha ficou salva com seguranca, rode /config testar apos corrigir.', store.getConfig(interaction.guildId))] });
  }
  return true;
}

module.exports = { data, execute, handleSenhaModal };
