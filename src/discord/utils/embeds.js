// feito por: maquinzz
const { EmbedBuilder } = require('discord.js');

function cor(cfg) {
  const raw = (cfg && cfg.cidade && cfg.cidade.cor) || '0x2B2D31';
  const n = Number(raw);
  return Number.isInteger(n) ? n : 0x2B2D31;
}

function mostraCreditos(cfg) {
  return !cfg || !cfg.cidade || cfg.cidade.mostrarCreditos !== false;
}

function textoRodape(cfg) {
  if (!mostraCreditos(cfg)) return (cfg.cidade.nome || 'Cidade');
  return 'feito por: maquinzz';
}

function rodape(cfg, icon) {
  const f = { text: textoRodape(cfg) };
  if (icon) f.iconURL = icon;
  return f;
}

function iconeServidor(guild) {
  try {
    if (guild && typeof guild.iconURL === 'function') return guild.iconURL({ extension: 'png', size: 128 });
  } catch {}
  return null;
}

function painelEmbed(cfg, guild) {
  const nome = cfg.cidade.nome || 'Nossa Cidade';
  const titulo = cfg.liberacao.titulo || ('Liberacao de ID | ' + nome);
  const desc = cfg.liberacao.descricao || cfg.cidade.descricao ||
    ('Para jogar em ' + nome + ' voce precisa liberar seu ID.\n\nClique no botao abaixo e informe seu nome de personagem e o ID que aparece na tela do jogo ao entrar na cidade.\n\nA liberacao e registrada no banco de dados da cidade e o cargo de liberado e aplicado automaticamente.');
  const e = new EmbedBuilder().setTitle(titulo).setDescription(desc).setColor(cor(cfg)).setFooter(rodape(cfg, iconeServidor(guild))).setTimestamp();
  if (cfg.cidade.logo && cfg.cidade.mostrarLogo !== false) e.setThumbnail(cfg.cidade.logo);
  if (cfg.cidade.banner && cfg.cidade.mostrarBanner !== false) e.setImage(cfg.cidade.banner);
  return e;
}

function sucessoEmbed(cfg, nomePlayer, gameId, guild) {
  const nome = cfg.cidade.nome || 'Cidade';
  return new EmbedBuilder()
    .setTitle('ID liberado com sucesso')
    .setDescription('Jogador ' + nomePlayer + ' com ID ' + gameId + ' foi liberado em ' + nome + '.\n\nVoce ja pode entrar na cidade. Bom jogo.')
    .setColor(0x22C55E).setFooter(rodape(cfg, iconeServidor(guild))).setTimestamp();
}

function erroEmbed(msg, cfg) {
  return new EmbedBuilder().setTitle('Nao foi possivel concluir').setDescription(msg).setColor(0xEF4444).setFooter(rodape(cfg)).setTimestamp();
}

function infoEmbed(titulo, msg, cfg) {
  return new EmbedBuilder().setTitle(titulo).setDescription(msg).setColor(cor(cfg)).setFooter(rodape(cfg)).setTimestamp();
}

function boasVindasEmbed(cfg, nomePlayer, gameId, guild) {
  const nome = cfg.cidade.nome || 'Cidade';
  let desc = 'Ola ' + nomePlayer + ', seu ID ' + gameId + ' foi liberado em ' + nome + '.\n';
  if (cfg.liberacao.ipServidor) desc += '\nConecte com: ' + cfg.liberacao.ipServidor + '\n';
  if (cfg.liberacao.instrucoes) desc += '\n' + cfg.liberacao.instrucoes;
  return new EmbedBuilder().setTitle('Bem-vindo a ' + nome).setDescription(desc).setColor(0x22C55E).setFooter(rodape(cfg, iconeServidor(guild))).setTimestamp();
}

function statsEmbed(cfg, s) {
  return new EmbedBuilder()
    .setTitle('Liberacoes | ' + (cfg.cidade.nome || 'Cidade'))
    .setDescription('Total: ' + s.total + '\nHoje: ' + s.hoje + '\nUltimos 7 dias: ' + s.dias7 + '\nUltimos 30 dias: ' + s.dias30)
    .setColor(cor(cfg)).setFooter(rodape(cfg)).setTimestamp();
}

function statusServidorEmbed(cfg, online, jogadores, maximo, hostname) {
  const nome = cfg.cidade.nome || 'Cidade';
  const desc = online
    ? 'Servidor online\nJogadores: ' + jogadores + (maximo ? '/' + maximo : '') + '\n' + (hostname ? 'Nome: ' + hostname + '\n' : '') + (cfg.liberacao.ipServidor ? 'Conecte com: ' + cfg.liberacao.ipServidor : '')
    : 'Servidor offline ou inacessivel no momento. Tente de novo em instantes.';
  return new EmbedBuilder()
    .setTitle('Status | ' + nome)
    .setDescription(desc)
    .setColor(online ? 0x22C55E : 0xEF4444).setFooter(rodape(cfg)).setTimestamp();
}

function pendentesEmbed(cfg, rows) {
  const desc = rows.length === 0
    ? 'Nenhum ID aguardando liberacao.'
    : rows.map(r => 'ID ' + r.id + (r.nome ? ' | ' + r.nome : '')).join('\n').slice(0, 1800);
  return new EmbedBuilder().setTitle('IDs aguardando liberacao').setDescription(desc).setColor(cor(cfg)).setFooter(rodape(cfg)).setTimestamp();
}
function logEmbed(cfg, discordId, nomePlayer, gameId, afetados, guild) {
  return new EmbedBuilder()
    .setTitle('Novo ID liberado')
    .setDescription('Usuario: <@' + discordId + '>\nNome: ' + nomePlayer + '\nID: ' + gameId + '\nRegistros afetados: ' + afetados)
    .setColor(cor(cfg)).setFooter(rodape(cfg, iconeServidor(guild))).setTimestamp();
}

function auditEmbed(acao, adminId, detalhe, cfg, guild) {
  return new EmbedBuilder()
    .setTitle('Auditoria: ' + acao)
    .setDescription('Admin: <@' + adminId + '>\n' + detalhe)
    .setColor(cor(cfg)).setFooter(rodape(cfg, iconeServidor(guild))).setTimestamp();
}

function consultaEmbed(cfg, gameId, registro, donoLocal) {
  let desc = 'ID pesquisado: ' + gameId + '\n';
  if (!registro) {
    desc += 'Banco da cidade: nao encontrado.\n';
  } else {
    desc += 'Banco da cidade: encontrado. Status atual: ' + String(registro.status) + '.\n';
  }
  if (donoLocal) {
    desc += 'Registro local: <@' + donoLocal.discord_id + '> como ' + donoLocal.nome_player + '.';
  } else {
    desc += 'Registro local: nenhum.';
  }
  return new EmbedBuilder().setTitle('Consulta de ID').setDescription(desc).setColor(cor(cfg)).setFooter(rodape(cfg)).setTimestamp();
}

function statusConfigEmbed(cfg) {
  const b = cfg.banco;
  const senhaOk = b.senha ? 'configurada' : 'nao configurada';
  const desc =
    '**Cidade**\nNome: ' + (cfg.cidade.nome || 'nao definido') + '\nLogo: ' + (cfg.cidade.logo ? 'definida (' + (cfg.cidade.mostrarLogo === false ? 'oculta' : 'visivel') + ')' : 'nao definida') + '\nBanner: ' + (cfg.cidade.banner ? 'definido (' + (cfg.cidade.mostrarBanner === false ? 'oculto' : 'visivel') + ')' : 'nao definido') + '\nCreditos: ' + (cfg.cidade.mostrarCreditos === false ? 'ocultos' : 'visiveis') + '\n\n' +
    '**Banco**\nTipo: ' + (b.tipo || 'nao definido') + '\nHost: ' + (b.host || 'nao definido') + '\nPorta: ' + (b.porta || 'nao definida') + '\nUsuario: ' + (b.usuario || 'nao definido') + '\nSenha: ' + senhaOk + '\nDatabase: ' + (b.database || 'nao definido') + '\nSSL: ' + (b.ssl ? 'sim' : 'nao') + '\nTabela: ' + (b.tabela || 'nao definida') + '\nColuna ID: ' + (b.colunaId || 'nao definida') + '\nColuna status: ' + (b.colunaStatus || 'nao definida') + '\nColuna nome: ' + (b.colunaNome || 'nao usada') + '\nValor liberado: ' + (b.valorLiberado || 'nao definido') + '\n\n' +
    '**Liberacao**\nCargo: ' + (cfg.liberacao.cargoId ? '<@&' + cfg.liberacao.cargoId + '>' : 'nao definido') + '\nCanal logs: ' + (cfg.liberacao.canalLogsId ? '<#' + cfg.liberacao.canalLogsId + '>' : 'nao definido') + '\nLimite por conta: ' + (cfg.liberacao.maxIds === 0 ? 'ilimitado' : (cfg.liberacao.maxIds || 1)) + '\nIP servidor: ' + (cfg.liberacao.ipServidor || 'nao definido') + '\nRevogar ao sair: ' + (cfg.liberacao.revogarAoSair ? 'sim' : 'nao') + '\n\n' +
    '**Servidor FiveM**\nIP: ' + (cfg.servidor.ip || 'nao definido') + '\nPorta: ' + (cfg.servidor.porta || 'nao definida');
  return new EmbedBuilder().setTitle('Configuracao atual').setDescription(desc).setColor(cor(cfg)).setFooter(rodape(cfg)).setTimestamp();
}

module.exports = { painelEmbed, sucessoEmbed, erroEmbed, infoEmbed, logEmbed, auditEmbed, consultaEmbed, statusConfigEmbed, boasVindasEmbed, statsEmbed, statusServidorEmbed, pendentesEmbed };
