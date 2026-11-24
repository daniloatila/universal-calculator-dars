# Compatibilidade · Objetivo 01

A matriz separa compilação, execução e distribuição. Os alvos que ainda precisam de evidência estão indicados como pendentes.

| Ambiente | Compilação ou preparação | Execução verificada | Distribuição neste marco |
| --- | --- | --- | --- |
| Windows 11 Pro x64 · desktop Tauri | Executável local `target/release/dars-desktop.exe` encontrado. Registro do build e hash final pendentes de conciliação. | Pendente de evidência da janela real e do motor em WebView2. | Executável local de validação. `bundle.active=false`, sem instalador estável. |
| Windows 11 Pro x64 · CLI | `cargo build --locked --release -p dars-cli`, alvo `x86_64-pc-windows-msvc`. | **157/157** resultados comparados com oráculo Python em processo real. Conferidos os códigos de saída 0, 1 e 2. [Resultado](oracle.json) | Código-fonte, compilação local. |
| Windows 11 Pro x64 · Chrome | Build de produção com o WASM integrado. | Chrome 158.0.8127.38, **8/8** testes Playwright e **10/10** verificações de produção offline e carregamento de idiomas sob demanda. [Suíte Playwright](../../apps/web/tests/standard.spec.ts) · [Prova offline](../../tests/verify-web-offline.mjs) | Código-fonte, servido localmente para validação. |
| WebAssembly `wasm32-unknown-unknown` | Exportação gerada para o módulo Rust com o `wasm-bindgen 0.2.130`. | **20/20** comparações entre o WASM em Node e a CLI Windows. O teste Chrome acima também exerce WASM no navegador. [Resultado](parity.json) | Código-fonte, geração local. |
| Viewports de tablet e celular | Build web compartilhado. | Chrome passou as verificações de 320, 390, 768 e 1280 px e a análise automatizada axe em temas claro e escuro. A emulação confirma o layout nessas larguras. | Código-fonte web. |
| Linux x64 · CLI e navegador em CI | Configurado no workflow. | Pendente do resultado remoto para a revisão auditada. | Código-fonte, sem pacote de plataforma. |
| Linux desktop, macOS, Android, iOS e Windows ARM64 | Sem prova de compilação desktop ou móvel neste marco. | Sem execução nesses alvos. | Fora da distribuição desta etapa. |

O ambiente Windows foi registrado com build 26200, arquitetura AMD64, Rust 1.100.0 e Node 24.19.0. As versões de WebView2 instaladas são inventário do sistema. A versão usada pelo processo desktop precisa ser observada após execução. [Ambiente](environment.json)

A aplicação web carrega inicialmente seus arquivos da mesma origem. A prova offline usa um navegador com suporte a service workers e cache produzido em contexto isolado. A aplicação desktop incorpora os recursos web do mesmo build. [Compilação](../../docs/pt-BR/build.md)
