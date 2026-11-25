# Objetivo 03 · Compatibilidade e escopo de execução

[English](compatibility.md) · [Relatório integrado](REPORT.pt-BR.md) · [Registro de testes](tests.json) · [Reprodução](reproduction.pt-BR.md)

| Alvo | Escopo verificado |
| --- | --- |
| Windows x64 e WebView2 | Os executáveis nativos de desenvolvimento exercitaram o Standard e cada novo módulo pela interface real do WebView2. O candidato final passou em 17 verificações de interface e cinco ciclos mistos de medição com WebView2 `158.0.4370.33`. As execuções observaram workers ativos, ociosidade, minimização, restauração e fechamento. O Clippy em release de todo o workspace passou no Windows. [Interface Windows](windows-ui.json) · [Medições pareadas Windows](paired-windows.json) · [Proteção do Windows e lint](windows-protection.json) |
| Windows x64 e Chrome instalado | Os testes usaram Chrome `158.0.8127.38` com a distribuição de produção. Passaram os 93 testes, cobrindo dez módulos, tema escuro azul-marinho padrão, teclado, layouts compactos, sete idiomas, RTL árabe, recuperação de worker, registros locais e funcionamento offline. [Resultados no navegador](browser.json) |
| CLI e WebAssembly | A CLI release no Windows, o WASM Standard gerado e um WASM isolado por ferramenta avançada executam os contratos suportados. Os registros avançados completos e as falhas estruturadas são comparados com as requisições correspondentes na CLI. [Regressão](regression.pt-BR.md) · [Contrato do registro de cálculo](calculation-proof/contract.pt-BR.md) |
| Ubuntu hospedado | O workflow executa builds e testes Rust e frontend, todas as referências matemáticas independentes em Python, verificações estruturadas do WASM Standard, paridades CLI/WASM, Chromium e a suíte offline avulsa. [Workflow de CI](../../.github/workflows/ci.yml) |
| Windows hospedado | O workflow executa builds e testes Rust e frontend e compila e testa o desktop. A interface em Windows físico, o Chrome instalado, o ciclo de credencial e as capacidades reais do WebView2 têm registros separados. [Workflow de CI](../../.github/workflows/ci.yml) · [Regressão](regression.pt-BR.md) |
| macOS hospedado | O workflow compila e testa o desktop e exercita os contratos da CLI, do WASM e do frontend. Interface em macOS físico, empacotamento, assinatura e notarização ficam fora desta verificação. [Workflow de CI](../../.github/workflows/ci.yml) |

Os jobs de Windows, Ubuntu, macOS e segurança terminaram com sucesso no commit `c3af4870b6fe781f1b7526995fcd3761791aeead`. O escopo de execução física vem das evidências locais acima. [Resultado do CI](ci.json) · [Execução integrada exata](https://github.com/daniloatila/universal-calculator-dars/actions/runs/45651132774) · [Registro de aceitação](acceptance.json)

## Recursos web e funcionamento offline

A primeira abertura web prepara o shell e seu grupo de recursos essenciais. Os pacotes de outros idiomas carregam ao serem escolhidos, e os recursos avançados carregam sob demanda quando o módulo elegível é usado. Cada ferramenta avançada pode rodar offline depois de preparar os recursos da mesma versão enquanto houver conexão. Use **Operações → Usar somente recursos em cache** para limitar a página web controlada ao cache. A remoção pelo navegador ou uma mudança de versão pode exigir nova preparação. O executável desktop incorpora os recursos web compilados. [Guia de Operações](../../docs/pt-BR/operations.md) · [Suíte offline avulsa](../../tests/verify-web-offline.mjs) · [Configuração de recursos no Tauri](../../apps/desktop/tauri.conf.json)

Inglês, português brasileiro, mandarim simplificado, hindi, espanhol, árabe e francês são os sete idiomas da interface. O registro matemático usa as mesmas chaves e valores entre idiomas. Formatação de exibição, mensagens e layout são localizados. A suíte web contempla RTL árabe e layouts a 320 px. A largura mínima configurada para o desktop e a largura testada no navegador são medidas distintas. [Definições de idiomas](../../apps/web/src/i18n.ts) · [Configuração Tauri](../../apps/desktop/tauri.conf.json)

## Escopo de distribuição

O código e as evidências públicas descrevem um candidato de desenvolvimento. A verificação do Windows usa o executável compilado localmente e o WebView2 instalado. O relatório registra hashes do executável e do WASM para identificação. Release estável, distribuição assinada, publicação em loja e notarização ficam fora da entrega atual. [Relatório integrado](REPORT.pt-BR.md) · [Instruções de build](../../docs/pt-BR/build.md)
