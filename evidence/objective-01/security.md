# Evidências de segurança · Objetivo 01

A [política da fundação](../../docs/pt-BR/security.md) descreve os dados tratados, seus destinos, permissões e retenção. Esta auditoria cobre o módulo Standard e os alvos realmente verificados.

## Dependências e cadeia de fornecimento

O cargo-audit 0.23.0 examinou 425 entradas do lockfile com a base RustSec no commit `1d328b6bb9f2f350bf65c1c81ab68781cb9e018a`. Registrou **0 vulnerabilidades e 3 avisos**. O npm audit retornou **0 vulnerabilidades** para a árvore web. Os resultados cobrem as bases e os lockfiles consultados. [Auditoria Rust](rust-audit.json) · [Auditoria npm](npm-audit.json)

| Dependência | Resultado | Escopo |
| --- | --- | --- |
| `chrono 0.4.45` | Aviso de manutenção `RUSTSEC-2026-0543` | Presente no lockfile. Ausente dos grafos Windows x64 e WASM consultados e de ambos os grafos desktop rastreados. |
| `glib 0.18.5` | Aviso de *unsoundness* `RUSTSEC-2024-0429` | Dependência de execução do desktop Linux via GTK/WebKitGTK. Ausente de Windows x64 e WASM. |
| `proc-macro-error 1.0.4` | Aviso de manutenção `RUSTSEC-2024-0370` | Dependência de compilação das macros GTK/Glib no desktop Linux. Ausente de Windows x64 e WASM. |

O desktop Linux fica fora da distribuição desta etapa. O resultado de CI para uma CLI Linux não valida o grafo nem a execução do desktop Linux. [Matriz de compatibilidade](compatibility.md)

O workflow declara acesso somente de leitura ao conteúdo e fixa as ações de checkout e Node por SHA. A configuração desabilita a persistência de credenciais no checkout. Rust, npm e o gerador WASM usam versões ou lockfiles explícitos. A execução remota ainda precisa ser confirmada. [Workflow](../../.github/workflows/ci.yml)

## Licenças

O código próprio usa Apache 2.0. O inventário considera os manifestos e os lockfiles locais. Foi conferido com `cargo tree --offline --locked --edges normal,build --prefix none --format "{p}|{l}"` para a CLI e o desktop Windows x64 e o WASM. O grafo inclui ferramentas de build e identifica componentes a examinar. O conteúdo exato de um binário depende do que foi vinculado. [Licença DARS](../../LICENSE) · [Cargo.lock](../../Cargo.lock) · [package-lock.json](../../apps/web/package-lock.json)

| Dependência direta de produto | Licença declarada | Fonte |
| --- | --- | --- |
| `num-bigint`, `num-integer`, `num-rational`, `num-traits` | MIT ou Apache 2.0 | [rust-num](https://github.com/rust-num) |
| `serde`, `serde_json` | MIT ou Apache 2.0 | [Serde](https://github.com/serde-rs/serde) e [serde_json](https://github.com/serde-rs/json) |
| `wasm-bindgen` | MIT ou Apache 2.0 | [wasm-bindgen](https://github.com/wasm-bindgen/wasm-bindgen) |
| `tauri` e `tauri-build` | Apache 2.0 ou MIT | [Tauri](https://github.com/tauri-apps/tauri) |
| `react` e `react-dom` | MIT | [React](https://github.com/facebook/react) |

As três dependências do grafo de execução npm são React, React DOM e Scheduler, todas MIT. Os grafos Rust consultados incluem licenças permissivas e licenças Unicode. O grafo de desktop Windows também inclui `cssparser`, `cssparser-macros`, `dtoa-short`, `option-ext` e `selectors`, todos sob MPL 2.0.

A publicação de código próprio e registros de dependências usa um escopo diferente da distribuição de executáveis ou de um bundle web. Os arquivos gerados são ignorados pelo Git. Para distribuir um artefato compilado, inventarie as dependências presentes, reúna os textos e avisos aplicáveis e identifique como obter o código dos componentes MPL cobertos. [MPL 2.0](https://www.mozilla.org/en-US/MPL/2.0/) · [FAQ da Mozilla sobre distribuição](https://www.mozilla.org/en-US/MPL/2.0/FAQ/) · [Licença Unicode](https://www.unicode.org/license.txt)

## Entradas, permissões e privacidade

- O parser Rust usa uma gramática e uma árvore de expressão com limites de bytes, dígitos, nós e profundidade. O núcleo limita a magnitude e proíbe código Rust `unsafe`. O oráculo Python registrou 157/157 verificações e a comparação Windows e WASM, 20/20. Esses resultados sustentam os casos de limite e paridade verificados. [Parser](../../crates/dars-core/src/parser.rs) · [Núcleo](../../crates/dars-core/src/lib.rs) · [Oráculo](oracle.json) · [Paridade](parity.json)
- A configuração Tauri define CSP restritiva, carregamento de recursos da própria origem e lista vazia de capacidades, com a API Tauri global desabilitada. A política de produção web restringe scripts, conexões e workers à própria origem e permite a compilação WebAssembly. A confirmação em janela desktop permanece pendente. [Configuração Tauri](../../apps/desktop/tauri.conf.json) · [Política do build Vite](../../apps/web/vite.config.ts)
- A inspeção encontrou cálculo em memória, cópia por ação do usuário, armazenamento local de idioma e tema e cache limitado aos recursos estáticos do mesmo build. A lista de recursos é gerada no build. O código do catálogo é o único dado da preferência de idioma enviado ao service worker para cache. Expressões e resultados permanecem na sessão. [Worker WASM](../../apps/web/src/wasm-worker.ts) · [Calculadora](../../apps/web/src/standard.tsx) · [Preferências](../../apps/web/src/preferences.ts) · [Cache](../../apps/web/offline-plugin.mjs)
- No Windows, uma instância de teste isolada do Chrome 158.0.8127.38 passou as **10 verificações** de produção offline e idiomas sob demanda. A página recarregada do service worker calculou `0.1+0.2` e `12/4` sem novos pedidos ao servidor. Apenas o catálogo selecionado foi solicitado e a página abriu em português após novo recarregamento offline. Nenhum pedido externo foi observado no contexto testado. A prova cobre o fluxo web com os arquivos já recebidos. [Reprodução](../../tests/verify-web-offline.mjs)

## Publicação

Os binários de teste e caches ficam fora do índice por configuração do Git. Permanece pendente uma varredura de segredos no índice exato que será publicado. A avaliação da árvore de publicação depende dessa revisão.
