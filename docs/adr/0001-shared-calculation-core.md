# ADR 001 · A shared calculation core

[Português brasileiro](#adr-001--um-núcleo-de-cálculo-compartilhado)

## Context

Objective 01 requires exact results, matching outcomes across environments, and a working Windows and web product. Arithmetic typed and displayed in JavaScript can lose precision at the interface boundary.

## Decision

Evaluate canonical text in one Rust library. The CLI calls it natively. The browser interface and Tauri's embedded Vite build call the same WASM binding. Represent numeric values as strings in the client contract. Keep formatting and interface state in TypeScript.

## Consequences

Math changes and tests have one source. Cross-runtime tests still have to exercise serialization, the browser binding and native integration. WebAssembly increases build requirements and the first-load payload. Measure its compiled transfer and startup costs alongside native execution. Changing libraries or crossing into another numeric domain requires explicit semantics and independent verification.

---

# ADR 001 · Um núcleo de cálculo compartilhado

[English](#adr-001--a-shared-calculation-core)

## Contexto

O Objetivo 01 exige resultados exatos, equivalência entre ambientes e um produto funcional para Windows e web. Operações transferidas e apresentadas como números JavaScript podem perder precisão na interface.

## Decisão

Avaliar texto canônico em uma biblioteca Rust. A CLI chama o núcleo nativamente. A interface do navegador e o build Vite incorporado ao Tauri chamam a mesma função WASM. Representar valores numéricos como texto no contrato com as interfaces. Manter formatação e estado da interface em TypeScript.

## Consequências

Alterações matemáticas e testes têm uma fonte única. Testes entre ambientes ainda precisam verificar serialização, integração com navegador e execução nativa. O WebAssembly exige ferramentas adicionais de compilação e aumenta os dados da primeira carga. Meça o tamanho transferido e o custo de inicialização junto à execução nativa. A troca de bibliotecas ou a entrada em outro domínio numérico exige semântica explícita e verificação independente.
