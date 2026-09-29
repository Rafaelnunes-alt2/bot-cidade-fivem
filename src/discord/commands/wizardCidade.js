// feito por: maquinzz
const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, RoleSelectMenuBuilder, ChannelSelectMenuBuilder, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const store = require('../../store/guildStore');
const { testConnection } = require('../../database/manager');
const { infoEmbed, erroEmbed } = require('../utils/embeds');
const { isAdmin, isGuildInteraction, botCanManageRole, botCanSend } = require('../utils/permissions');
const { isValidUrl, normalizeColor, isValidHost, isValidPort, isValidSqlIdent, isValidDbName, isValidDbUser, friendlyDbError, bancoConfigCompleto } = require('../utils/validators');
const { enviarAuditoria } = require('../utils/audit');
const { refreshPainel, buildPainelRow, aposentarPainelAntigo } = require('./painel');
const { painelEmbed } = require('../utils/embeds');
const log = require('../utils/logger');

const wizControl = new Map();
const wizBanco = new Map();
const wizPainelCanal = new Map();

function key(interaction) {
  return interaction.user.id + ':' + interaction.guildId;
}

function expirar(map, k, ms) {
  setTimeout(() => map.delete(k), ms).unref();
}

function linha(ok, texto) {
  return (ok ? '[OK] ' : '[FALTA] ') + texto;
}

function buildWizardEmbed(guildId) {
  const cfg = store.getConfig(guildId);
  const banco = store.getBancoComSenha(guildId);
  const l1 = linha(!!cfg.cidade.nome, 'Cidade: ' + (cfg.cidade.nome || 'botao 1'));
  const l2 = linha(bancoConfigCompleto(banco).ok, 'Banco: ' + (banco.tabela ? banco.tipo + ' tabela ' + banco.tabela : 'botao 2'));
  const l3 = linha(!!cfg.liberacao.cargoId, 'Cargo e logs: ' + (cfg.liberacao.cargoId ? 'definidos' : 'menus abaixo'));
  const l4 = linha(!!(cfg.servidor.ip && cfg.servidor.porta), 'Servidor FiveM: ' + (cfg.servidor.ip ? 'definido' : 'botao 4'));
  return infoEmbed('Assistente da cidade', l1 + '\n' + l2 + '\n' + l3 + '\n' + l4 + '\n\nRode em canal da staff. Quando tudo estiver OK, toque em Publicar.', cfg);
}

function buildWizardRows(guildId, guild) {
  const cfg = store.getConfig(guildId);
  const botoes = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('wiz_cidade').setLabel('1 Cidade').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('wiz_banco').setLabel('2 Banco').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('wiz_textos').setLabel('3 Textos').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('wiz_servidor').setLabel('4 Servidor').setStyle(ButtonStyle.Primary)
  );
  const cargo = new RoleSelectMenuBuilder().setCustomId('wiz_cargo').setPlaceholder('Cargo de liberado').setMinValues(1).setMaxValues(1);
  if (cfg.liberacao.cargoId && (!guild || guild.roles.cache.has(cfg.liberacao.cargoId))) cargo.setDefaultRoles([cfg.liberacao.cargoId]);
  const logs = new ChannelSelectMenuBuilder().setCustomId('wiz_logs').setPlaceholder('Canal de logs').setMinValues(1).setMaxValues(1).addChannelTypes(ChannelType.GuildText);
  if (cfg.liberacao.canalLogsId && (!guild || guild.channels.cache.has(cfg.liberacao.canalLogsId))) logs.setDefaultChannels([cfg.liberacao.canalLogsId]);
  const canal = new ChannelSelectMenuBuilder().setCustomId('wiz_canal').setPlaceholder('Canal do painel').setMinValues(1).setMaxValues(1).addChannelTypes(ChannelType.GuildText);
  const pub = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('wiz_publicar').setLabel('5 Publicar painel').setStyle(ButtonStyle.Success)
  );
  return [botoes, new ActionRowBuilder().addComponents(cargo), new ActionRowBuilder().addComponents(logs), new ActionRowBuilder().addComponents(canal), pub];
}

async function refreshControl(client, guildId) {
  try {
    const ref = wizControl.get(guildId);
    if (!ref) return false;
    const ch = await client.channels.fetch(ref.channelId).catch(() => null);
    if (!ch) return false;
    const msg = await ch.messages.fetch(ref.messageId).catch(() => null);
    if (!msg) return false;
    const guild = ch.guild || await client.guilds.fetch(guildId).catch(() => null);
    await msg.edit({ embeds: [buildWizardEmbed(guildId)], components: buildWizardRows(guildId, guild) });
    return true;
  } catch {
    return false;
  }
}

function txt(id, label, style, required, max, value) {
  const t = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(max);
  if (value) t.setValue(String(value).slice(0, max));
  return t;
}

function modalCidade(cfg) {
  const m = new ModalBuilder().setCustomId('wiz_m_cidade').setTitle('Etapa 1 de 4: Cidade');
  m.addComponents([
    txt('nome', 'Nome da cidade', TextInputStyle.Short, true, 60, cfg.cidade.nome),
    txt('logo', 'Link da logo', TextInputStyle.Short, false, 300, cfg.cidade.logo),
    txt('banner', 'Link do banner', TextInputStyle.Short, false, 300, cfg.cidade.banner),
    txt('cor', 'Cor ex #22C55E', TextInputStyle.Short, false, 9, null),
    txt('descricao', 'Descricao do painel', TextInputStyle.Paragraph, false, 1500, cfg.cidade.descricao)
  ].map(c => new ActionRowBuilder().addComponents(c)));
  return m;
}

function modalBanco1(cfg) {
  const b = cfg.banco;
  const m = new ModalBuilder().setCustomId('wiz_m_banco1').setTitle('Banco 1 de 3: Conexao');
  m.addComponents([
    txt('tipo', 'Tipo: mysql ou postgres', TextInputStyle.Short, true, 10, b.tipo),
    txt('host', 'IP ou host do banco', TextInputStyle.Short, true, 255, b.host),
    txt('porta', 'Porta: 3306 ou 5432', TextInputStyle.Short, true, 5, b.porta),
    txt('usuario', 'Usuario do banco', TextInputStyle.Short, true, 64, b.usuario),
    txt('database', 'Nome do database', TextInputStyle.Short, true, 64, b.database)
  ].map(c => new ActionRowBuilder().addComponents(c)));
  return m;
}

function modalBanco2(cfg) {
  const b = cfg.banco;
  const m = new ModalBuilder().setCustomId('wiz_m_banco2').setTitle('Banco 2 de 3: Tabela');
  m.addComponents([
    txt('tabela', 'Tabela ex users', TextInputStyle.Short, true, 64, b.tabela),
    txt('colunaId', 'Coluna do ID ex id', TextInputStyle.Short, true, 64, b.colunaId),
    txt('colunaStatus', 'Coluna da liberacao', TextInputStyle.Short, true, 64, b.colunaStatus),
    txt('valorLiberado', 'Valor que libera ex 1', TextInputStyle.Short, true, 20, b.valorLiberado),
    txt('valorBloqueado', 'Valor bloqueado ex 0', TextInputStyle.Short, false, 20, b.valorBloqueado)
  ].map(c => new ActionRowBuilder().addComponents(c)));
  return m;
}

function modalBanco3() {
  const m = new ModalBuilder().setCustomId('wiz_m_banco3').setTitle('Banco 3 de 3: Senha');
  m.addComponents([
    txt('senha', 'Senha do banco', TextInputStyle.Short, true, 200, null),
    txt('colunaNome', 'Coluna do nome ex name', TextInputStyle.Short, false, 64, null),
    txt('ssl', 'SSL? sim para Supabase', TextInputStyle.Short, false, 5, null)
  ].map(c => new ActionRowBuilder().addComponents(c)));
  return m;
}

function modalTextos1(cfg) {
  const l = cfg.liberacao;
  const m = new ModalBuilder().setCustomId('wiz_m_textos1').setTitle('Textos 1 de 2: Painel');
  m.addComponents([
    txt('titulo', 'Titulo do painel', TextInputStyle.Short, false, 120, l.titulo),
    txt('descricao', 'Descricao do painel', TextInputStyle.Paragraph, false, 1500, l.descricao),
    txt('textoBotao', 'Texto do botao verde', TextInputStyle.Short, false, 40, l.textoBotao),
    txt('maxIds', 'Limite de IDs por conta', TextInputStyle.Short, false, 2, l.maxIds),
    txt('ipServidor', 'IP de conexao', TextInputStyle.Short, false, 100, l.ipServidor)
  ].map(c => new ActionRowBuilder().addComponents(c)));
  return m;
}

function modalTextos2(cfg) {
  const l = cfg.liberacao;
  const m = new ModalBuilder().setCustomId('wiz_m_textos2').setTitle('Textos 2 de 2: Regras');
  m.addComponents([
    txt('instrucoes', 'Mensagem da DM de boas-vindas', TextInputStyle.Paragraph, false, 500, l.instrucoes),
    txt('revogar', 'Revogar ao sair? sim ou nao', TextInputStyle.Short, false, 5, l.revogarAoSair ? 'sim' : null),
    txt('creditos', 'Credito no rodape? sim ou nao', TextInputStyle.Short, false, 5, null)
  ].map(c => new ActionRowBuilder().addComponents(c)));
  return m;
}

function modalServidor(cfg) {
  const m = new ModalBuilder().setCustomId('wiz_m_servidor').setTitle('Etapa 4 de 4: FiveM');
  m.addComponents([
    txt('ip', 'IP do servidor FiveM', TextInputStyle.Short, true, 255, cfg.servidor.ip),
    txt('porta', 'Porta ex 30120', TextInputStyle.Short, true, 5, cfg.servidor.porta)
  ].map(c => new ActionRowBuilder().addComponents(c)));
  return m;
}

function continuarRow(customId, label) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(ButtonStyle.Primary)
  );
}

const data = new SlashCommandBuilder()
  .setName('config-toda-cidade')
  .setDescription('Assistente que configura a cidade inteira de uma vez')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function execute(interaction) {
  if (!isGuildInteraction(interaction)) {
    return interaction.reply({ embeds: [erroEmbed('Use este comando dentro do servidor.', store.getConfig(interaction.guildId))], ephemeral: true });
  }
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ embeds: [erroEmbed('Apenas administradores podem usar este comando.', store.getConfig(interaction.guildId))], ephemeral: true });
  }
  const canal = interaction.channel;
  const chk = botCanSend(canal);
  if (!chk.ok) return interaction.reply({ embeds: [erroEmbed('Nao consigo postar aqui: ' + chk.motivo, store.getConfig(interaction.guildId))], ephemeral: true });
  const guildId = interaction.guildId;
  wizPainelCanal.set(interaction.user.id + ':' + guildId, interaction.channelId);
  expirar(wizPainelCanal, interaction.user.id + ':' + guildId, 60 * 60 * 1000);
  const msg = await canal.send({ embeds: [buildWizardEmbed(guildId)], components: buildWizardRows(guildId, interaction.guild) });
  wizControl.set(guildId, { channelId: canal.id, messageId: msg.id });
  expirar(wizControl, guildId, 60 * 60 * 1000);
  return interaction.reply({ embeds: [infoEmbed('Assistente aberto', 'Painel de configuracao postado em <#' + canal.id + '>. Use os botoes por la. Rode em canal da staff.', store.getConfig(guildId))], ephemeral: true });
}

function parseSim(v) {
  if (!v) return false;
  return ['sim', 's', 'yes', 'true', '1'].includes(String(v).trim().toLowerCase());
}

async function deny(interaction, msg) {
  await interaction.reply({ embeds: [erroEmbed(msg, store.getConfig(interaction.guildId))], ephemeral: true });
  return true;
}

async function handleButton(interaction) {
  const id = interaction.customId;
  if (!['wiz_cidade', 'wiz_banco', 'wiz_banco2', 'wiz_banco3', 'wiz_textos', 'wiz_textos2', 'wiz_servidor', 'wiz_publicar'].includes(id)) return false;
  if (!isGuildInteraction(interaction)) return deny(interaction, 'Use dentro do servidor.');
  if (!isAdmin(interaction.member)) return deny(interaction, 'Apenas administradores.');
  const cfg = store.getConfig(interaction.guildId);
  if (id === 'wiz_cidade') await interaction.showModal(modalCidade(cfg));
  else if (id === 'wiz_banco') await interaction.showModal(modalBanco1(cfg));
  else if (id === 'wiz_banco2') {
    const pend = wizBanco.get(interaction.user.id + ':' + interaction.guildId);
    if (!pend || !pend.tipo) return deny(interaction, 'Preencha a parte 1 primeiro pelo botao 2 Banco.');
    await interaction.showModal(modalBanco2(cfg));
  } else if (id === 'wiz_banco3') {
    const pend = wizBanco.get(interaction.user.id + ':' + interaction.guildId);
    if (!pend || !pend.tabela) return deny(interaction, 'Preencha as partes 1 e 2 primeiro pelo botao 2 Banco.');
    await interaction.showModal(modalBanco3());
  } else if (id === 'wiz_textos') await interaction.showModal(modalTextos1(cfg));
  else if (id === 'wiz_textos2') await interaction.showModal(modalTextos2(cfg));
  else if (id === 'wiz_servidor') await interaction.showModal(modalServidor(cfg));
  else if (id === 'wiz_publicar') await publicar(interaction);
  return true;
}

async function handleSelect(interaction) {
  const id = interaction.customId;
  if (!['wiz_cargo', 'wiz_logs', 'wiz_canal'].includes(id)) return false;
  if (!isGuildInteraction(interaction)) return deny(interaction, 'Use dentro do servidor.');
  if (!isAdmin(interaction.member)) return deny(interaction, 'Apenas administradores.');
  const guildId = interaction.guildId;
  if (id === 'wiz_cargo') {
    const role = interaction.roles.first();
    if (!role) return deny(interaction, 'Nenhum cargo selecionado.');
    const chk = botCanManageRole(interaction.guild, role.id);
    if (!chk.ok) return deny(interaction, chk.motivo);
    const cfg = store.setLiberacao(guildId, { cargoId: role.id });
    await enviarAuditoria(interaction.guild, cfg, 'Assistente: cargo definido', interaction.user.id, 'Cargo: <@&' + role.id + '>');
    await refreshPainel(interaction.guild, guildId);
  } else if (id === 'wiz_logs') {
    const ch = interaction.channels.first();
    if (!ch) return deny(interaction, 'Nenhum canal selecionado.');
    const chk = botCanSend(ch);
    if (!chk.ok) return deny(interaction, 'Canal de logs: ' + chk.motivo);
    store.setLiberacao(guildId, { canalLogsId: ch.id });
  } else if (id === 'wiz_canal') {
    const ch = interaction.channels.first();
    if (!ch) return deny(interaction, 'Nenhum canal selecionado.');
    const chk = botCanSend(ch);
    if (!chk.ok) return deny(interaction, 'Canal do painel: ' + chk.motivo);
    wizPainelCanal.set(interaction.user.id + ':' + guildId, ch.id);
    expirar(wizPainelCanal, interaction.user.id + ':' + guildId, 60 * 60 * 1000);
  }
  await interaction.update({ embeds: [buildWizardEmbed(guildId)], components: buildWizardRows(guildId, interaction.guild) });
  return true;
}

async function okSilent(interaction, guildId) {
  await refreshControl(interaction.client, guildId);
  try {
    await interaction.deleteReply();
  } catch {}
}

async function handleModal(interaction) {
  const id = interaction.customId;
  if (!id.startsWith('wiz_m_')) return false;
  if (!isGuildInteraction(interaction)) return deny(interaction, 'Use dentro do servidor.');
  if (!isAdmin(interaction.member)) return deny(interaction, 'Apenas administradores.');
  const guildId = interaction.guildId;
  const g = (n) => (interaction.fields.getTextInputValue(n) || '').trim();
  const k = interaction.user.id + ':' + guildId;

  if (id === 'wiz_m_cidade') {
    const nome = g('nome');
    const logo = g('logo');
    const banner = g('banner');
    const corTxt = g('cor');
    const descricao = g('descricao');
    await interaction.deferReply({ ephemeral: true });
    if (logo && !isValidUrl(logo)) {
      await interaction.editReply({ embeds: [erroEmbed('Logo invalida. Use link https terminando em png, jpg, jpeg, webp ou gif.', store.getConfig(guildId))] });
      return true;
    }
    if (banner && !isValidUrl(banner)) {
      await interaction.editReply({ embeds: [erroEmbed('Banner invalido. Use link https terminando em png, jpg, jpeg, webp ou gif.', store.getConfig(guildId))] });
      return true;
    }
    let corNorm;
    if (corTxt) {
      corNorm = normalizeColor(corTxt);
      if (!corNorm) {
        await interaction.editReply({ embeds: [erroEmbed('Cor invalida. Use formato #22C55E.', store.getConfig(guildId))] });
        return true;
      }
    }
    const cfg = store.setCidade(guildId, { nome, ...(logo ? { logo } : {}), ...(banner ? { banner } : {}), ...(corNorm ? { cor: corNorm } : {}), ...(descricao ? { descricao } : {}) });
    await enviarAuditoria(interaction.guild, cfg, 'Assistente: cidade definida', interaction.user.id, 'Nome: ' + nome);
    await refreshPainel(interaction.guild, guildId);
    await okSilent(interaction, guildId);
    return true;
  }

  if (id === 'wiz_m_banco1') {
    let tipo = g('tipo').toLowerCase();
    if (tipo === 'mariadb') tipo = 'mysql';
    const host = g('host');
    const porta = Number(g('porta'));
    const usuario = g('usuario');
    const database = g('database');
    await interaction.deferReply({ ephemeral: true });
    if (!['mysql', 'postgres'].includes(tipo)) {
      await interaction.editReply({ embeds: [erroEmbed('Tipo invalido. Digite mysql ou postgres.', store.getConfig(guildId))] });
      return true;
    }
    if (!isValidHost(host) || !isValidPort(porta) || !isValidDbUser(usuario) || !isValidDbName(database)) {
      await interaction.editReply({ embeds: [erroEmbed('Conexao invalida. Confira host, porta, usuario e database.', store.getConfig(guildId))] });
      return true;
    }
    wizBanco.set(k, { tipo, host, porta, usuario, database });
    expirar(wizBanco, k, 10 * 60 * 1000);
    await interaction.editReply({
      embeds: [infoEmbed('Parte 1 de 3 salva', tipo + ' ' + host + ':' + porta + '.\n\nToque em continuar para a parte 2.', store.getConfig(guildId))],
      components: [continuarRow('wiz_banco2', 'Continuar para 2 de 3')]
    });
    return true;
  }

  if (id === 'wiz_m_banco2') {
    const pend = wizBanco.get(k);
    if (!pend) {
      await interaction.reply({ embeds: [erroEmbed('Sessao expirada. Toque em 2 Banco de novo.', store.getConfig(guildId))], ephemeral: true });
      return true;
    }
    const tabela = g('tabela');
    const colunaId = g('colunaId');
    const colunaStatus = g('colunaStatus');
    const valorLiberado = g('valorLiberado');
    const valorBloqueado = g('valorBloqueado');
    await interaction.deferReply({ ephemeral: true });
    if (!isValidSqlIdent(tabela) || !isValidSqlIdent(colunaId) || !isValidSqlIdent(colunaStatus) || !valorLiberado) {
      await interaction.editReply({ embeds: [erroEmbed('Tabela ou colunas invalidas. Apenas letras, numeros e underscore, e informe o valor que libera.', store.getConfig(guildId))] });
      return true;
    }
    wizBanco.set(k, { ...pend, tabela, colunaId, colunaStatus, valorLiberado, valorBloqueado: valorBloqueado || null });
    expirar(wizBanco, k, 10 * 60 * 1000);
    await interaction.editReply({
      embeds: [infoEmbed('Parte 2 de 3 salva', 'Tabela ' + tabela + '.\n\nToque em continuar para a parte 3, a senha.', store.getConfig(guildId))],
      components: [continuarRow('wiz_banco3', 'Continuar para 3 de 3')]
    });
    return true;
  }

  if (id === 'wiz_m_banco3') {
    const pend = wizBanco.get(k);
    if (!pend) {
      await interaction.reply({ embeds: [erroEmbed('Sessao expirada. Toque em 2 Banco de novo.', store.getConfig(guildId))], ephemeral: true });
      return true;
    }
    const senha = g('senha');
    const colunaNome = g('colunaNome');
    const ssl = parseSim(g('ssl'));
    await interaction.deferReply({ ephemeral: true });
    if (!senha) {
      await interaction.editReply({ embeds: [erroEmbed('Senha vazia.', store.getConfig(guildId))] });
      return true;
    }
    if (colunaNome && !isValidSqlIdent(colunaNome)) {
      await interaction.editReply({ embeds: [erroEmbed('Coluna de nome invalida.', store.getConfig(guildId))] });
      return true;
    }
    store.setBanco(guildId, { ...pend, senha, ssl, colunaNome: colunaNome || null });
    wizBanco.delete(k);
    try {
      const banco = store.getBancoComSenha(guildId);
      await testConnection(banco);
      const cfg = store.getConfig(guildId);
      await enviarAuditoria(interaction.guild, cfg, 'Assistente: banco configurado', interaction.user.id, pend.tipo + ' tabela ' + pend.tabela);
      await refreshControl(interaction.client, guildId);
      await interaction.deleteReply().catch(() => null);
    } catch (e) {
      log.error('Wizard banco falhou', e);
      await interaction.editReply({ embeds: [erroEmbed('Dados salvos, mas a conexao falhou: ' + friendlyDbError(e), store.getConfig(guildId))] });
    }
    return true;
  }

  if (id === 'wiz_m_textos1') {
    const titulo = g('titulo');
    const descricao = g('descricao');
    const textoBotao = g('textoBotao');
    const maxTxt = g('maxIds');
    const ipServidor = g('ipServidor');
    await interaction.deferReply({ ephemeral: true });
    let maxIds;
    if (maxTxt) {
      maxIds = Number(maxTxt);
      if (!Number.isInteger(maxIds) || maxIds < 0 || maxIds > 10) {
        await interaction.editReply({ embeds: [erroEmbed('Limite invalido. Use 0 a 10.', store.getConfig(guildId))] });
        return true;
      }
    }
    store.setLiberacao(guildId, {
      ...(titulo ? { titulo } : {}), ...(descricao ? { descricao } : {}), ...(textoBotao ? { textoBotao } : {}),
      ...(maxIds !== undefined ? { maxIds } : {}), ...(ipServidor ? { ipServidor } : {})
    });
    await refreshPainel(interaction.guild, guildId);
    await interaction.editReply({
      embeds: [infoEmbed('Parte 1 de 2 salva', 'Toque em continuar para a parte 2.', store.getConfig(guildId))],
      components: [continuarRow('wiz_textos2', 'Continuar para 2 de 2')]
    });
    return true;
  }

  if (id === 'wiz_m_textos2') {
    const instrucoes = g('instrucoes');
    const revogar = g('revogar');
    const creditos = g('creditos');
    await interaction.deferReply({ ephemeral: true });
    store.setLiberacao(guildId, {
      ...(instrucoes ? { instrucoes } : {}),
      ...(revogar ? { revogarAoSair: parseSim(revogar) } : {})
    });
    if (creditos) store.setCidade(guildId, { mostrarCreditos: parseSim(creditos) });
    const cfg = store.getConfig(guildId);
    await enviarAuditoria(interaction.guild, cfg, 'Assistente: textos definidos', interaction.user.id, 'Painel e regras salvos.');
    await refreshPainel(interaction.guild, guildId);
    await refreshControl(interaction.client, guildId);
    await interaction.deleteReply().catch(() => null);
    return true;
  }

  if (id === 'wiz_m_servidor') {
    const ip = g('ip');
    const porta = Number(g('porta'));
    await interaction.deferReply({ ephemeral: true });
    if (!isValidHost(ip) || !isValidPort(porta)) {
      await interaction.editReply({ embeds: [erroEmbed('IP ou porta invalidos.', store.getConfig(guildId))] });
      return true;
    }
    const cfg = store.setServidor(guildId, { ip, porta });
    await enviarAuditoria(interaction.guild, cfg, 'Assistente: servidor definido', interaction.user.id, ip + ':' + porta);
    await refreshControl(interaction.client, guildId);
    await interaction.deleteReply().catch(() => null);
    return true;
  }

  return false;
}

function parseSim(v) {
  if (!v) return false;
  return ['sim', 's', 'yes', 'true', '1'].includes(String(v).trim().toLowerCase());
}

async function publicar(interaction) {
  const guildId = interaction.guildId;
  await interaction.deferReply({ ephemeral: true });
  const cfg = store.getConfig(guildId);
  if (!cfg.cidade.nome) {
    await interaction.editReply({ embeds: [erroEmbed('Falta a etapa 1 Cidade.', cfg)] });
    return;
  }
  const banco = store.getBancoComSenha(guildId);
  if (!bancoConfigCompleto(banco).ok) {
    await interaction.editReply({ embeds: [erroEmbed('Falta a etapa 2 Banco.', cfg)] });
    return;
  }
  if (!cfg.liberacao.cargoId) {
    await interaction.editReply({ embeds: [erroEmbed('Escolha o cargo no menu do assistente.', cfg)] });
    return;
  }
  try {
    await testConnection(banco);
  } catch (e) {
    log.error('Wizard publicar falhou no teste', e);
    await interaction.editReply({ embeds: [erroEmbed('Banco falhou no teste final: ' + friendlyDbError(e), cfg)] });
    return;
  }
  const alvoId = wizPainelCanal.get(interaction.user.id + ':' + guildId) || interaction.channelId;
  const alvo = await interaction.guild.channels.fetch(alvoId).catch(() => null) || interaction.channel;
  const chk = botCanSend(alvo);
  if (!chk.ok) {
    await interaction.editReply({ embeds: [erroEmbed('Canal do painel: ' + chk.motivo, cfg)] });
    return;
  }
  await aposentarPainelAntigo(interaction.guild, guildId);
  const msg = await alvo.send({ embeds: [painelEmbed(cfg, interaction.guild)], components: [buildPainelRow(cfg)] });
  store.setLiberacao(guildId, { painelCanalId: alvo.id, painelMensagemId: msg.id });
  await enviarAuditoria(interaction.guild, store.getConfig(guildId), 'Assistente: cidade publicada', interaction.user.id, 'Painel em <#' + alvo.id + '>');
  await refreshControl(interaction.client, guildId);
  await interaction.editReply({ embeds: [infoEmbed('Cidade no ar', 'Painel publicado em <#' + alvo.id + '>.\n\nSua cidade esta pronta. Teste com /config testar e liberando um ID de teste.', store.getConfig(guildId))] });
}

module.exports = { data, execute, handleButton, handleSelect, handleModal };
