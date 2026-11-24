# Segurança e privacidade da fundação

[English](../en/security.md)

## Dados e permissões

| Dado ou operação | Destino | Finalidade e permissão | Retenção |
| --- | --- | --- | --- |
| Expressão, resultado, histórico, desfazer, refazer e memória | Sessão atual do aplicativo | Funções locais da calculadora | Apenas durante a sessão |
| Preferência explícita de tema e idioma | Aplicativo ou perfil do navegador local | Restaurar as escolhas feitas na interface | Até limpar a preferência ou os dados do aplicativo |
| Copiar resultado | Área de transferência do sistema operacional | Ação explícita do usuário pelo mecanismo da plataforma | Definida pelo sistema operacional e suas configurações da área de transferência |
| Recursos do aplicativo web | Origem estática que hospeda o aplicativo | Carregar HTML, scripts, estilos e WebAssembly | Conforme o cache do navegador |
| Arquivos do aplicativo para uso offline | Armazenamento de cache do navegador na origem do aplicativo | Abrir o build carregado sem rede onde houver suporte a service workers | Cache versionado por build ou até limpar os dados do site |
| Dependências de build e CI | Registros públicos de pacotes e destinos de CI configurados | Preparação do ambiente de desenvolvimento e integração contínua | Conforme as políticas do desenvolvedor e do serviço |

O cálculo ocorre no dispositivo. Telemetria, rastreamento, anúncios, contas, modelos de linguagem, avaliação remota, sincronização externa e consultas do atualizador do aplicativo ficam fora deste marco. O primeiro acesso web precisa receber os arquivos estáticos. Em um navegador compatível, um service worker armazena os recursos do build para uso offline. O aplicativo desktop carrega diretamente os arquivos incorporados. O cache web contém apenas arquivos do build.

## Limites

- Trate expressões como dados matemáticos. Use o parser Rust para limitar tamanho, tokens, aninhamento e operações antes e durante a avaliação.
- Mantenha credenciais, autorização para destinos externos e execução arbitrária do sistema fora do núcleo e da interface. A configuração desktop não concede permissões de plugins. Documente a finalidade e o acesso a dados de qualquer alteração futura.
- Mantenha os recursos de produção locais e use a política de segurança de conteúdo do desktop para permitir os recursos empacotados necessários para WASM. Teste falhas do parser, conteúdo colado e texto não confiável sem abrir destinos externos.
- Mantenha segredos, caminhos pessoais e logs brutos fora dos relatórios publicados. Inspecione os arquivos versionados antes da publicação. Confira versões fixadas de ferramentas, dependências com lockfile, licenças de terceiros e alertas conhecidos.

Veja as [evidências de segurança do Objetivo 01](../../evidence/objective-01/security.md) para os testes executados, resultados e limites observados.
