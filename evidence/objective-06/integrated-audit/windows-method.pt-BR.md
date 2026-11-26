# Método de verificação física no Windows

[English](windows-method.md)

A referência é o executável 0.5.1 revisado no Objetivo 05, com SHA-256 `847982f6e3db718fbde20e8eb4b6ce2d71d50fc6cf08b9353f58e392aecc3473`. A candidata 0.6.0 exige job Windows bem-sucedido na branch de revisão do Objetivo 06 e correspondência exata entre commit, execução e artefato. Antes de abrir a aplicação, o verificador confere a integridade do ZIP, os arquivos contidos, os tamanhos, o hash do executável, a arquitetura PE, a versão e o manifesto WASM. [Recibo de referência](../../objective-05/revision-01/windows-artifact.json) · [Verificador de aquisição](../../../scripts/verify-science-windows-artifact.ps1)

Os comandos abaixo usam variáveis PowerShell para os caminhos dos executáveis, o recibo verificado e o hash hexadecimal minúsculo da candidata. Execute-os em sequência em sessão interativa do Windows com WebView2 instalado. Cada abertura usa um perfil de teste separado.

```powershell
./scripts/verify-science-windows-artifact.ps1 -ArtifactId $artifactId -RunId $runId -Commit $commit -Version 0.6.0
node scripts/verify-science-desktop.mjs $baselineExe $candidateExe $receipt artifacts/objective-06/paired-desktop
node scripts/verify-desktop.mjs --objective-06 --exe $candidateExe
node scripts/verify-finance-desktop.mjs --candidate-only $candidateExe $candidateHash artifacts/objective-06/finance-offline.json 0.6.0
node scripts/verify-finance-comparison-v041.mjs $candidateExe $candidateHash artifacts/objective-06/finance-comparison 0.6.0
```

O ensaio compara o tempo de abertura até um resultado conferido do módulo Padrão, 12 recálculos e a memória da árvore de processos em fases equivalentes de visibilidade, repouso, minimização e restauração. Separa o conjunto residente privado, o conjunto residente total e a memória privada comprometida do aplicativo e dos processos auxiliares. Os contadores gerais do Windows incluem outros processos. Uma máquina e uma execução por versão limitam as conclusões. O caso do painel de inteligência usa provedor desativado e calcula uma proposta local. Nenhum servidor de IA é iniciado.

Na candidata, os sete módulos científicos e de dados operam offline. O Graph Lab e o Data Lab passam por três visitas cada. O ensaio confere JSON misto, compara os bytes dos 22 WASM empacotados com seus hashes e conta 25 módulos registrados. Quatro casos adicionais exercitam o notebook financeiro, uma fórmula com versão fixada, uma automação com dois cenários e uma proposta da inteligência verificada pelo Rust. O protocolo do navegador registra aberturas e fechamentos de workers. Ensaios financeiros adicionais exercitam cinco exemplos offline e reproduzem uma comparação histórica. A suíte Windows histórica abrange 17 verificações. [Casos de produtividade](../../../scripts/verify-productivity-windows.mjs) · [Comparação entre versões](../../../scripts/verify-science-desktop.mjs)

Com a emulação de rede do WebView ainda offline, o transporte nativo recebe consentimento explícito para servidores HTTP sintéticos em loopback IPv4 e IPv6. A interface confere a lista de modelos, proposta financeira estruturada, pedido de esclarecimento, rejeição de operação desconhecida e porta fechada. A rotina fecha os servidores de teste, restaura o modo desativado e deixa o módulo com zero workers. [Casos do transporte nativo](../../../scripts/verify-intelligence-windows.mjs)
