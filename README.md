# bot-cidade-fivem

Bot de Discord para whitelist de servidores FiveM RP. Publica um painel com botão, coleta nome e ID via modal, grava a liberação direto no banco da cidade (MySQL ou Postgres), entrega o cargo e registra em canal de logs. Configuração toda via slash commands, sem editar arquivo.

## Por que eu fiz isso

Administrar whitelist de city no manual é planilha e DM. Quis um fluxo fechado dentro do Discord: jogador clica, preenche, o banco atualiza e a staff audita pelo log.

## O que faz

Fluxo principal: `/painel` publica o painel no canal. Jogador clica em Liberar ID, preenche nome do personagem e ID no modal. O bot faz UPDATE na tabela configurada, adiciona o cargo de liberado e posta o registro no canal de logs.

Administração: `/config` ajusta cidade, banco, liberação e servidor. `/pendentes` lista quem ainda não liberou. `/stats` mostra totais. `/status` consulta players e vagas direto do servidor FiveM. Wizards guiam a configuração inicial em etapas.

## Comandos

| Comando | Função |
|:--|:--|
| /config | Configura cidade, banco, liberação e servidor em subgrupos |
| /painel | Publica o painel de liberação no canal indicado |
| /pendentes | Lista IDs ainda não liberados com limite configurável |
| /stats | Totais de liberados, pendentes e uso |
| /status | Online, jogadores e vagas via players.json e info.json |
| /configbot | Avatar, atividade e presença do bot |
| /wizardCidade | Configuração da cidade em 5 etapas |
| /wizardBot | Configuração do perfil do bot em etapas |
| /guia | Resumo de uso dentro do Discord |

## Como funciona

Config por servidor fica no store local (SQLite). Dados da cidade ficam no banco que a staff configurar: MySQL via mysql2 ou Postgres via pg. Tabela, colunas de ID, status e nome são definidas por comando, com validação de identificador e quoting por dialeto antes de qualquer query.

Senha do banco nunca trafega em chat: vai em modal privado e efêmero. Conexão sempre com timeout de 8 segundos e fechamento garantido. Status do servidor lê players.json e info.json do endpoint FiveM com timeout de 6 segundos e cooldown de 15 segundos por usuário.

## Stack

Node 18 ou superior, discord.js v14, better-sqlite3 para config local, mysql2 e pg para o banco da cidade, dotenv para ambiente.

## Estrutura

    src/
      index.js               bootstrap e shutdown
      config.js              validação de env
      database/manager.js    MySQL e Postgres com ident validation
      database/crypto.js     criptografia local
      store/guildStore.js    config por servidor
      discord/client.js      client e intents
      discord/commands/      9 slash commands
      discord/components/    buttons e modals
      discord/events/        ready, interaction, member remove
      discord/utils/         embeds, permissions, validators, audit, logger
    deploy-commands.js       registro guild ou global
    package.json
    .env.example

## Setup

    cp .env.example .env

Preenche no .env:

    TOKEN=token do bot no discord.dev
    CLIENT_ID=application id
    GUILD_ID=id do servidor para deploy rápido, vazio registra global
    SECRET_KEY=senha forte com 32 ou mais caracteres

    npm install
    npm run deploy
    npm start

Com GUILD_ID os comandos aparecem na hora. Sem ele o registro global demora até 1 hora para propagar.

## Segurança

SECRET_KEY abaixo de 32 caracteres aborta o boot. Senha do banco só via modal privado, nunca aparece em `/config ver` nem em log. Identificadores de tabela e coluna passam por validação antes de montar SQL, com quoting separado para MySQL e Postgres. Respostas sensíveis são efêmeras. Cooldown por usuário em comando público.

## Testes validados

Fluxo local com XAMPP: banco MySQL com tabela users, `/config banco` apontando para 127.0.0.1, `/config testar` com OK, `/painel` publicado, liberação de ID 45 com nome, conferência via SELECT mostrando whitelisted igual a 1 e nome gravado. Consulta, revogação, pendentes, stats e export executados. Status contra servidor FiveM com players e vagas.

## Limitações

Sem painel web, tudo é Discord. Integração com a city é via banco relacional, sem recurso nativo de framework ESX ou QBCore além da tabela. Sem testes automatizados, validação manual por comandos. Sem fila de retry se o banco cair no meio da liberação.

## Próximos passos

Testes automatizados para manager e validators, retry com backoff em falha de banco, painel web de auditoria, suporte a múltiplas cidades por servidor.

## Autor

Rafael Nunes — [@Rafaelnunes-alt2](https://github.com/Rafaelnunes-alt2)
