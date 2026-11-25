# Alterações de arquitetura do Objetivo 04

[English](changes.md)

O Rust reutiliza `num-bigint` e `num-rational` para valores monetários, saldos internos e arredondamento explícito. O contrato canônico aceita até 18 dígitos inteiros e 12 fracionários e recebe taxas como frações. O subconjunto da ISO 4217 inclui moedas com zero, duas e três casas decimais. Quando a operação depende de potências fracionárias ou logaritmos, o resultado indica as condições da aproximação.

Cada módulo financeiro carrega um WASM próprio pelo gerenciador existente, mantém um módulo principal ativo e usa o encerramento real dos workers. Cada campo preenchido preserva a origem de sua notação. O idioma atual controla a apresentação e a requisição canônica mantém o valor que o usuário digitou.

A prova conserva o esquema 1 e os limites anteriores de 4 KiB para a entrada, 32 KiB para o resultado e 128 KiB para o arquivo de prova. Tabelas maiores podem ser paginadas. O arquivo local de reprodução de cenários usa o esquema 1, com até seis requisições e 64 KiB. A importação recalcula as entradas pelo Rust. O visualizador de provas mantém a indicação de que um registro importado não foi verificado.

O comparador usa saídas calculadas, apresenta diferenças absolutas e relativas e omite o percentual quando a referência é zero. As premissas ficam na sessão até o usuário exportar. O gráfico compara a magnitude do indicador selecionado e deixa a escolha da alternativa ao usuário.

O modo RPN foi avaliado como opcional. A versão usa formulários explícitos para documentar tipos de taxas, pagamentos e fluxos na prova. As projeções de investimento usam premissas manuais. Os empréstimos identificam a estimativa de custo efetivo e a metodologia. O módulo tributário delimita de forma explícita regimes e vigências de fontes oficiais. [Matriz de regras](tax/rules.pt-BR.md)
