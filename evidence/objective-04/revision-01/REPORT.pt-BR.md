# Revisão corretiva do Objetivo 04

[English](REPORT.md) · [Contrato de comparação](comparison-contract.pt-BR.md)

A avaliação independente atribuiu 91/100 à candidata 0.4.0 e manteve a aprovação pendente. A revisão corrige o problema na comparação de cenários e três achados adicionais reproduzidos durante a auditoria. [Achados](findings.json)

- A 0.4.0 exibiu diferença de 0,11 e variação relativa de 110% entre 10% ao semestre e 21% ao ano. A prova arquivada guardava os números apresentados e a subtração sem a periodicidade dos operandos. [Interface e prova originais](before-windows.json)
- A comparação original de empréstimos indicava a proposta 1 como a de menor custo nominal mesmo diante de valores financiados e vencimentos diferentes. A seleção passou a exigir valor financiado, prazo, datas de pagamento e base de liquidação compatíveis. [Prova original do CLI](loan-selection-v040.json)
- Uma versão intermediária da 0.4.1 exibiu como zero uma diferença exata de 10⁻²⁴ com 16 casas decimais. A comparação passou a indicar `≈0` e a prova mantém a fração exata. [Teste de precisão](../../../apps/web/tests/finance-comparison.spec.ts)
- Uma versão intermediária mostrou 16 casas decimais na diferença do custo efetivo de dois empréstimos datados, apesar de cada cálculo usar tolerância de parada de 10⁻¹². A prova informa as tolerâncias e limita as casas exibidas. Diferenças abaixo da resolução são omitidas. [Estimativa original e cálculo independente](approximation-intermediate.json)

O Rust recalcula os cenários e deriva o contexto de cada indicador. As conversões admitidas usam a base efetiva anual. No caso reproduzido, ambas as taxas são exatamente 21/100 e a diferença é zero. As definições dos cinco módulos distinguem moedas, períodos, horizontes, fluxos, regras tributárias e retornos bruto, líquido, nominal e real conforme o indicador. [Matriz de compatibilidade](compatibility-matrix.json) · [Reprodução](reproduction.md)

## Verificação

O oráculo Python e a paridade entre CLI e WASM passaram em 84 casos cada, com 79 reexecuções de prova. O Chrome passou em 172 testes, incluindo 12 do comparador revisado. A matriz confirmou 420 comparações de provas matemáticas e 210 de provas financeiras em 42 transições direcionais entre sete idiomas. Também passaram os 2.355 casos matemáticos avançados, 305 comparações matemáticas CLI/WASM e 577 casos financeiros da regressão. [Registro de testes](tests.json) · [Matriz de idiomas](locale-transition-matrix.json) · [Regressão](regression.pt-BR.md)

As 16 amostras de Price cobriram 360 e 600 parcelas com arredondamento final ou por linha no WASM local em Windows. A comparação detalhada de 600 parcelas chegou a 11,04 segundos, dentro do prazo de 15 segundos do Worker. O arredondamento por linha foi mais rápido e produziu totais contratuais diferentes. A medição usou duas amostras por percurso em um computador. [Medições e limites](benchmarks.json)

O executável Windows x64 hospedado rodou no WebView2 local 158.0.4370.33. O ZIP e o executável corresponderam aos hashes do Actions. A origem local serviu os 15 módulos WASM com os hashes registrados. O executável de revisão sem assinatura passou nas 17 verificações históricas de interface e nos cinco exemplos financeiros offline. [Proveniência e conferência](windows-artifact.json) · [Interface](windows-regression.json) · [Exemplos offline](desktop.json)

O caso das taxas produziu diferença exata zero no Windows. Reabrir o arquivo da 0.4.0 reconstruiu a mesma entrada normalizada e o mesmo resultado. A prova comparativa ocupou 6.008 bytes, ante 3.128 bytes na 0.4.0. O novo arquivo de cenários ocupou 1.081 bytes. Houve no máximo um Worker ativo, zero requisições HTTP externas durante o teste e zero processos da aplicação após fechar. [Interface corrigida](after-windows.png) · [Calculation Proof](comparison-proof.json) · [Resultado no Windows](after-windows.json)

A medição pareada do Standard registrou uma mediana de memória residente privada de 103,49 MB na 0.3.1 e 103,88 MB na 0.4.1. Esses valores descrevem os processos da aplicação. A meta de menos de 100 MB de RAM física incremental continua em aberto. [Medições pareadas](desktop.json) · [Acompanhamento da memória](../../objective-02/revision-02/memory-debt.pt-BR.md)

As 602 verificações históricas mapeadas passaram. A execução hospedada no Ubuntu mediu 97,26% de cobertura nas 6.208 linhas financeiras instrumentadas. Os jobs de Ubuntu, Windows, macOS e segurança passaram no commit auditado `5329e697a105685f3206d14adac9832224bcf53e`. [Cobertura](coverage.json) · [CI](ci.json) · [GitHub Actions](https://github.com/daniloatila/universal-calculator-dars/actions/runs/45846772329)

O Objetivo 04 está `READY_FOR_REVIEW`. Os Objetivos 01 a 03 estão aprovados. O Objetivo 05 permanece `NOT_STARTED`. O branch aguarda nova auditoria independente e decisão explícita do proprietário. [Aceitação](acceptance.json)
