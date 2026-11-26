# DARS Intelligence

[English](README.md) · [Contratos dos provedores](providers.pt-BR.md) · [Esquema das propostas](proposal.schema.json) · [Voz e visão](../voice-vision/README.pt-BR.md)

Abra **Operações → DARS Intelligence**. O modo de fábrica é **Desativado**. No navegador e no desktop, é possível abrir, revisar e reproduzir uma proposta ou prova com o motor Rust. Escolher um provedor e editar o pedido não abre conexão. O desktop cria o cliente HTTP nativo depois que o usuário autoriza uma transmissão específica.

## Configuração e diagnóstico local

1. Selecione **IA local** e escolha Ollama, LM Studio ou um servidor compatível de confiança instalado na máquina.
2. Escolha `127.0.0.1` ou `::1` e a porta do serviço. Clique em **Revisar consulta de modelos**, confira o destino GET e autorize a consulta. O corpo da requisição é vazio. O envio da credencial local nessa consulta depende de uma seleção explícita.
3. Escolha um modelo anunciado ou digite seu identificador. Revise finalidade, corpo, destino, quantidade de bytes e limite da resposta. Autorize o envio individual. Alterar o destino ou editar o pedido exige outra revisão.
4. Confira as entradas propostas e execute o cálculo. É possível inspecionar ou exportar a prova Rust. A explicação opcional de um modelo exige um novo envio e leva a indicação de texto não verificado, com atribuição própria.

A aplicação usa o socket local no endereço escolhido. Não há busca em interfaces ou portas, alteração de VPN, proxy ou rotas, inicialização de serviços nem download de modelos. A tela diferencia conexão recusada, prazo excedido, acesso negado pelo sistema, autenticação recusada, resposta incompatível, serviço sem modelos elegíveis e modelo ausente. Uma recusa comprova a situação daquele endereço e porta no momento da consulta. Esse dado não identifica uma VPN como causa. Um servidor compatível controla seu próprio processamento e qualquer comunicação subsequente. É preciso confiar na implementação local escolhida. Os adaptadores Ollama e LM Studio verificam os metadados do modelo instalado antes do envio do pedido. [Observação do ambiente](local-services.json)

## Execução e privacidade

A IA pode propor juros compostos ou uma expressão, solicitar informações, recusar um pedido, explicar ou preparar um documento para Notebook, Formula ou Automation. O documento passa pela validação do estúdio de destino. O esquema rejeita capacidades desconhecidas, campos adicionais e resultados forjados. Textos, metadados e respostas de modelos não concedem permissões para obter credenciais, escolher arquivos, alterar políticas ou definir destinos de rede. A comunicação nativa aceita pedidos da janela principal empacotada. O navegador conserva a política de rede de mesma origem. [Validação](../../../apps/web/src/intelligence-contract.ts) · [Política nativa](../../../apps/desktop/src/intelligence.rs)

A autorização fixa o conteúdo e o destino, vale por 120 segundos e admite um uso. O gateway permite uma operação simultânea e seis inícios por minuto. Os limites são 8 KiB de texto, contexto configurável de 128 a 4.096 tokens, resposta de 32 a 1.024 tokens, prazo total de 1 a 30 segundos, envelope de resposta de 64 KiB e até 8 KiB de texto extraído. A estimativa conservadora de contexto inclui instruções e enquadramento do protocolo. O preço depende do provedor. Os envios externos validam o certificado TLS, recusam redirecionamentos e desativam novas tentativas automáticas. As políticas do sistema e do proxy configurado continuam válidas para esses envios. Cobrança e retenção dependem do provedor e da conta.

A chave temporária pertence ao provedor, endereço e porta. No Windows, a persistência opcional usa o Gerenciador de Credenciais somente para chaves externas. O componente nativo de comunicação envia a credencial no cabeçalho HTTP. A tela permite substituir e remover a chave. Exportações omitem prompts e credenciais. Fechar o painel cancela o trabalho e libera credenciais temporárias e recursos de cálculo. Nos demais sistemas, o aplicativo não instala cofre e evita gravar a chave nas preferências comuns. [Cofre nativo](../../../apps/desktop/src/credentials.rs)

## Verificação

| Ambiente | Resultado observado |
| --- | --- |
| Rust nativo | Onze testes cobriram seis protocolos, seleção do modelo local, política offline, consentimento de uso único, escopo de chaves, limites, cancelamento, redirecionamentos e falhas HTTP. Sockets TCP reais nos dois loopbacks confirmaram consulta GET de corpo vazio e chave somente com autorização explícita. |
| Desktop Windows | WebView2 usou o IPC Rust compilado. Servidores sintéticos temporários responderam com proposta de investimento, pedido de informações e operação desconhecida. O Rust calculou o valor, a interface pediu esclarecimento e a operação desconhecida foi rejeitada. Encerrar o servidor produziu a mensagem específica de conexão recusada. [Recibo do desktop](native-loopback.json) |
| Chrome | Reabrir a prova e fornecer um resultado forjado levou a um novo cálculo local. Seis cenários passaram, incluindo 42 trocas dirigidas de idioma com o mesmo resultado Rust, reconhecimento visual e rejeição de arquivo inválido. [Recibo](browser.json) · [Idiomas](languages.json) |
| Node | Cinco testes de contrato cobriram pares de idiomas, preservação de precisão, recusa de capacidades diretas e contidas em documentos, erros de esquema e reprodução. [Testes](../../../apps/web/tests/intelligence.test.mts) |
| Inferência real | Os dois provedores locais padrão recusaram a conexão de inventário. As verificações dos provedores externos usaram dados sintéticos. Inferência real, permissões de conta, faturamento e latência externa continuam sem validação. Nenhuma chave real ou chamada paga foi usada. |

No exemplo financeiro, o capital é R$ 10.000, a taxa é 1% ao mês e o prazo é 12 meses. O Rust calculou R$ 11.268,25 a partir de `1126825030131969720661201/100000000000000000000`. A reprodução usa a interpretação estruturada e o motor local. [Captura do navegador](verified-investment.png) · [Roteiro Windows](../../../scripts/verify-intelligence-windows.mjs)

Na raiz, execute `cargo test --locked -p dars-desktop --lib intelligence` e `node --experimental-strip-types --test apps/web/tests/intelligence.test.mts`. Em `apps/web`, gere o bundle de produção e execute `npx --no-install playwright test tests/intelligence.spec.ts`. O roteiro Windows usa a página WebView2 do ensaio de desktop e encerra os servidores temporários ao terminar.

A primeira validação verifica a estrutura da proposta. Ao executar, o Rust verifica a expressão. A leitura dos tokens JSON originais recusa chaves duplicadas, inteiros inseguros e sintaxe fracionária em campos inteiros, tanto na proposta quanto no envelope de reprodução. Uma expressão sintaticamente inválida fica sem resultado matemático.
