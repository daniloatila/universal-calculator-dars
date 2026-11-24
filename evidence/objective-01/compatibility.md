# Compatibilidade · Objetivo 01

A matriz separa compilação, execução e distribuição. Os alvos que ainda precisam de evidência estão indicados como pendentes.

| Ambiente | Compilação ou preparação | Execução verificada | Distribuição neste marco |
| --- | --- | --- | --- |
| Windows 11 Pro x64 · desktop Tauri | `cargo build --locked --release -p dars-desktop`. O executável local tem 8.387.072 bytes e hash registrado. [Manifesto](artifacts.json) | Janela e WebView2 reais. **5/5** verificações, incluindo aritmética e erro de divisão por zero. Primeira resposta em 787, 691 e 659 ms em três lançamentos com perfis isolados. [Resultados](windows-x64.json) · [Captura](windows-x64.png) | Executável local de validação. `bundle.active=false`, sem instalador estável. |
| Windows 11 Pro x64 · CLI | `cargo build --locked --release -p dars-cli`, alvo `x86_64-pc-windows-msvc`. | **157/157** resultados comparados com oráculo Python em processo real. Conferidos os códigos de saída 0, 1 e 2. [Resultado](oracle.json) | Código-fonte, compilação local. |
| Windows 11 Pro x64 · Chrome | Build de produção com o WASM integrado. | Chrome 158.0.8127.38, **8/8** testes Playwright e **10/10** verificações de produção offline e carregamento de idiomas sob demanda. [Suíte Playwright](../../apps/web/tests/standard.spec.ts) · [Prova offline](../../tests/verify-web-offline.mjs) | Código-fonte, servido localmente para validação. |
| WebAssembly `wasm32-unknown-unknown` | Exportação gerada para o módulo Rust com o `wasm-bindgen 0.2.130`. | **20/20** comparações entre o WASM em Node e a CLI Windows. O teste Chrome acima também exerce WASM no navegador. [Resultado](parity.json) | Código-fonte, geração local. |
| Viewports de tablet e celular | Build web compartilhado. | Chrome passou as verificações de 320, 390, 768 e 1280 px e a análise automatizada axe em temas claro e escuro. A emulação confirma o layout nessas larguras. | Código-fonte web. |
| Linux x64 · CLI e navegador em CI | CLI nativa e bundle web compilados em clone limpo. | Oráculo independente, paridade e testes Chromium em produção passaram. [CI](https://github.com/daniloatila/universal-calculator-dars/actions/runs/45487008034) | Código-fonte, sem pacote de plataforma. |
| macOS arm64 · CLI e desktop em CI | A CLI e o pacote Tauri compilaram em clone limpo. | Oráculo independente e paridade CLI/WASM passaram. A janela Tauri não foi aberta. [CI](https://github.com/daniloatila/universal-calculator-dars/actions/runs/45487008034) | Código-fonte, sem pacote de plataforma. |
| Linux desktop, Android, iOS e Windows ARM64 | Sem prova de compilação desktop ou móvel neste marco. | Sem execução nesses alvos. | Fora da distribuição desta etapa. |

O ambiente Windows foi registrado com build 26200, arquitetura AMD64, Rust 1.100.0 e Node 24.19.0. A WebView2 carregada pelo executável informou a versão 158.0.4370.33. Uma verificação suplementar exibiu `1/3` no modo exato e sua expansão de 24 dígitos no modo decimal, com o contexto offline. [Ambiente](environment.json) · [Fração exata no Windows](windows-exact.json)

A aplicação web carrega inicialmente seus arquivos da mesma origem. A prova offline usa um navegador com suporte a service workers e cache produzido em contexto isolado. A aplicação desktop incorpora os recursos web do mesmo build. [Compilação](../../docs/pt-BR/build.md)
