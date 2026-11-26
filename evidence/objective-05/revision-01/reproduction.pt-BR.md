# Reprodução dos três achados

[English](reproduction.md)

Use o commit de cada versão identificado no recibo. Compile a CLI com `cargo build --locked --release -p dars-cli` e os módulos WASM correspondentes com o wasm-bindgen fixado pelo projeto e `node scripts/build-wasm.mjs`. O código da 0.5.0 é `50225fb5dccb677b10653058f81d89c168a5743c`. O [relatório original](../REPORT.pt-BR.md) identifica as evidências históricas.

Os dois arquivos em `synthetic/` contêm dados fictícios publicáveis. O [exemplo em Python](reproduction.md) pode ser executado na raiz do projeto com ambas as versões. No Windows, use `target/release/dars.exe`. O script confirma o SHA-256, envia os bytes originais à entrada padrão, apresenta o perfil de cada coluna e reexecuta cada prova da versão 2.

No JSON, compare as duas células e a contagem, soma e média. No XLSX, o mesmo serial aparece diretamente e no cache de uma fórmula. Compare as duas células primeiro como datas e depois como decimais. Na 0.5.0, use a página WASM `LocalDataset.page(0,25)`. Na versão corrigida, também pode usar `dataset CONFIGURAÇÃO --page 0 25` na CLI. [Observações originais](before.json) · [Observações da revisão](after.json)

Para reproduzir o teste de recursos, execute `python -B tests/verify-data-revision.py target/release/dars.exe --readers` com as dependências de validação do workflow. Cada ensaio usa dados pequenos e alterna o orçamento. O teste verifica a rejeição e a recuperação, inclusive para um arquivo que cabe no limite de entrada. Os testes Rust exercitam também rejeições durante a produção de saídas de uma tabela já aberta. O benchmark mede os processos separadamente, para quatro volumes de entrada e diferentes larguras de tabela. [Medições e orçamentos](benchmarks.json)
