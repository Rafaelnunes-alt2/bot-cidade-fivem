// feito por: maquinzz
const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const store = require('../../store/guildStore');
const { painelEmbed, erroEmbed, infoEmbed, auditEmbed } = require('../utils/embeds');
const { isAdmin, isGuildInteraction, botCanSend } = require('../utils/permissions');

const data = new SlashCommandBuilder()
  .setName('painel')
  .setDescription('Enviar o painel de liberacao de ID')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption(o => o.setName('canal').setDescription('Canal onde o painel sera enviado').setRequired(false).addChannelTypes(ChannelType.GuildText));

function buildPainelRow(cfg) {
  const texto = (cfg.liberacao.textoBotao || 'Liberar ID').slice(0, 40);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('liberar_id_btn').setLabel(texto).setStyle(ButtonStyle.Success)
  );
}

async function aposentarPainelAntigo(guild, guildId) {
  try {
    const cfg = store.getConfig(guildId);
    if (!cfg.liberacao.painelCanalId || !cfg.liberacao.painelMensagemId) return;
    const canal = await guild.channels.fetch(cfg.liberacao.painelCanalId).catch(() => null);
    if (!canal) return;
    const msg = await canal.messages.fetch(cfg.liberacao.painelMensagemId).catch(() => null);
    if (!msg) return;
    if (msg.author && msg.author.id !== (guild.members.me ? guild.members.me.id : null)) return;
    await msg.delete().catch(() => null);
  } catch {}
}

async function refreshPainel(guild, guildId) {
  const cfg = store.getConfig(guildId);
  if (!cfg.liberacao.painelCanalId || !cfg.liberacao.painelMensagemId) return { ok: false, motivo: 'sem_painel' };
  try {
    const canal = await guild.channels.fetch(cfg.liberacao.painelCanalId).catch(() => null);
    if (!canal) {
      store.setLiberacao(guildId, { painelCanalId: null, painelMensagemId: null });
      return { ok: false, motivo: 'canal_sumiu' };
    }
    const chk = botCanSend(canal);
    if (!chk.ok) return { ok: false, motivo: chk.motivo };
    const payload = { embeds: [painelEmbed(cfg, guild)], components: [buildPainelRow(cfg)] };
    try {
      const msg = await canal.messages.fetch(cfg.liberacao.painelMensagemId);
      await msg.edit(payload);
      return { ok: true, modo: 'editado' };
    } catch (e) {
      if (e && e.code === 10008) {
        const nova = await canal.send(payload);
        store.setLiberacao(guildId, { painelCanalId: canal.id, painelMensagemId: nova.id });
        return { ok: true, modo: 'republicado' };
      }
      return { ok: false, motivo: 'falha_edicao' };
    }
  } catch {
    return { ok: false, motivo: 'erro' };
  }
}
async function execute(interaction) {
  if (!isGuildInteraction(interaction)) {
    return interaction.reply({ embeds: [erroEmbed('Use este comando dentro do servidor.', store.getConfig(interaction.guildId))], ephemeral: true });
  }
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ embeds: [erroEmbed('Apenas administradores podem usar este comando.', store.getConfig(interaction.guildId))], ephemeral: true });
  }
  const guildId = interaction.guildId;
  const cfg = store.getConfig(guildId);
  if (store.senhaPrecisaReconfigurar(guildId)) {
    return interaction.reply({ embeds: [erroEmbed('A SECRET_KEY foi trocada. Rode /config banco de novo antes de enviar o painel.', store.getConfig(interaction.guildId))], ephemeral: true });
  }
  const banco = store.getBancoComSenha(guildId);
  if (!banco.tabela || !banco.colunaId || !banco.colunaStatus || !banco.host || !banco.senha) {
    return interaction.reply({ embeds: [erroEmbed('Configure o banco primeiro com /config banco antes de enviar o painel.', store.getConfig(interaction.guildId))], ephemeral: true });
  }
  if (!cfg.liberacao.cargoId) {
    return interaction.reply({ embeds: [erroEmbed('Configure o cargo primeiro com /config liberacao antes de enviar o painel.', store.getConfig(interaction.guildId))], ephemeral: true });
  }
  const alvo = interaction.options.getChannel('canal') || interaction.channel;
  const chk = botCanSend(alvo);
  if (!chk.ok) return interaction.reply({ embeds: [erroEmbed('Canal do painel: ' + chk.motivo, store.getConfig(interaction.guildId))], ephemeral: true });
  try {
    await aposentarPainelAntigo(interaction.guild, guildId);
    const msg = await alvo.send({ embeds: [painelEmbed(cfg, interaction.guild)], components: [buildPainelRow(cfg)] });
    store.setLiberacao(guildId, { painelCanalId: alvo.id, painelMensagemId: msg.id });
    if (cfg.liberacao.canalLogsId) {
      try {
        const ch = await interaction.guild.channels.fetch(cfg.liberacao.canalLogsId).catch(() => null);
        if (ch && botCanSend(ch).ok) await ch.send({ embeds: [auditEmbed('Painel publicado', interaction.user.id, 'Canal: <#' + alvo.id + '>', cfg, interaction.guild)] });
      } catch {}
    }
    return interaction.reply({ embeds: [infoEmbed('Painel enviado', 'Painel publicado em <#' + alvo.id + '>.', cfg)], ephemeral: true });
  } catch (e) {
    return interaction.reply({ embeds: [erroEmbed('Nao consegui enviar o painel: verifique minhas permissoes no canal.', store.getConfig(interaction.guildId))], ephemeral: true });
  }
}

module.exports = { data, execute, refreshPainel, buildPainelRow, aposentarPainelAntigo };
