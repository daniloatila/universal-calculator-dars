# Revisão corretiva do Objetivo 04

[English](REPORT.md) · [Contrato de comparação](comparison-contract.pt-BR.md)

A avaliação independente atribuiu 91/100 à candidata 0.4.0 e manteve a aprovação pendente. A revisão corrige dois problemas de interpretação financeira reproduzidos no branch do Objetivo 04. [Achados](findings.json)

- A 0.4.0 exibiu diferença de 0,11 e variação relativa de 110% entre 10% ao semestre e 21% ao ano. A prova arquivada guardava os números apresentados e a subtração sem a periodicidade dos operandos. [Interface e prova originais](before-windows.json)
- A comparação original de empréstimos indicava a proposta 1 como a de menor custo nominal mesmo diante de valores financiados e vencimentos diferentes. A seleção passou a exigir valor financiado, prazo, datas de pagamento e base de liquidação compatíveis. [Prova original do CLI](loan-selection-v040.json)

O Rust recalcula os cenários e deriva o contexto de cada indicador. As conversões admitidas usam a base efetiva anual. No caso reproduzido, ambas as taxas são exatamente 21/100 e a diferença é zero. As definições dos cinco módulos distinguem moedas, períodos, horizontes, fluxos, regras tributárias e retornos bruto, líquido, nominal e real conforme o indicador. [Matriz de compatibilidade](compatibility-matrix.json) · [Reprodução](reproduction.md)
