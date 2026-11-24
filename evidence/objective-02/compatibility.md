# Compatibilidade do Objetivo 02

| Plataforma | Escopo validado |
| --- | --- |
| Windows 11 x64 | Execução nativa Tauri/WebView2 com perfis isolados. Smoke de interface, privacidade, tema, precisão, memória, minimizar/restaurar e benchmark de ciclos. Teste independente do Gerenciador de Credenciais com entrada sintética. |
| Chrome Windows | Bundle de produção com oráculo matemático, testes de interface, recuperação do worker, modo offline explícito e sete idiomas. Idiomas, temas e viewport são verificações do navegador desktop. |
| Ubuntu x64 em CI | CLI e WASM, dois oráculos independentes, paridade, Chromium e service worker offline. O aplicativo desktop Linux ficou fora dessa execução. |
| Windows em CI | CLI, núcleo, WASM, web e compilação desktop. A execução interativa relatada vem do ensaio Windows local. |
| macOS em CI | CLI, núcleo, web, WASM, compilação desktop e comportamento de provedor indisponível. A execução interativa do aplicativo macOS ficou fora dessa verificação. |

O desktop usa recursos incorporados. O cache web explícito depende de uma página segura com service worker controlando a aplicação. A visibilidade nativa foi testada no Windows e as demais plataformas conservam os sinais disponíveis no runtime. A prova responsiva com toque emulado e viewport estreito cobre layout web em Chrome, com dispositivos físicos móveis fora do escopo desta entrega.

[Testes](tests.json) · [CI](ci.json) · [Benchmark](benchmarks.json)
