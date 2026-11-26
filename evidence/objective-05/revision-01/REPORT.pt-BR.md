# Revisão corretiva do Data Lab 0.5.1

[English](REPORT.md) · [Critérios verificados](acceptance.json) · [Achados](findings.json)

**Objetivo 05 — READY_FOR_REVIEW.** A auditoria independente atribuiu 89/100 à 0.5.0 e solicitou três correções. A revisão confirmou os três achados. Os objetivos 01 a 04 permanecem aprovados. O 06 aguarda nova autorização.

| Achado | Resultado na 0.5.0 | Resultado na 0.5.1 |
| --- | --- | --- |
| Número JSON e texto na mesma coluna, com vírgula decimal | Apenas o texto `"2,50"` entrou na soma. Uma observação, soma e média 5/2. | O número JSON `1.25` e o texto são válidos. Duas observações, soma exata 15/4 e média exata 15/8. |
| Data direta e data no cache de uma fórmula | O cache perdeu a classificação de data. Convertido para decimal, o serial entrou na soma. | As duas células preservam formato, época e data. A fórmula e o estado do cache continuam disponíveis. Nenhuma das datas entra na soma decimal. |
| Orçamento de recursos | O limite de arquivo e os limites por estrutura não abrangiam toda a materialização e as saídas. A opção de orçamento em bytes era desconhecida. | Importação, transformações, análise e saídas compartilham um orçamento. Entradas pequenas que extrapolaram um orçamento reduzido foram recusadas. A recuperação foi verificada. |

Os recibos mostram as mesmas entradas sintéticas, célula a célula, e as respectivas provas. Cada reexecução da versão 2 exige o SHA-256 dos dados e as configurações registradas. A migração de uma prova da versão 1 exige confirmação explícita. [Antes](before.json) · [Depois](after.json) · [Reprodução](reproduction.pt-BR.md) · [Contrato de tipos](data-type-contract.pt-BR.md) · [Compatibilidade](compatibility.pt-BR.md)

### Validação

A matriz cobre os 23 itens pedidos. O oráculo Python executou 23 grupos de casos e comparou 31 solicitações nativas e WASM. Decimal e Fraction fixam as referências exatas. pandas e openpyxl leram os mesmos arquivos. Para o serial 60,5 no calendário 1900, openpyxl devolveu 28 de fevereiro ao meio-dia. O DARS conserva o serial e indica que o dia fictício não tem representação gregoriana. [Matriz](tests.json) · [Oráculo e versões dos leitores](oracle.json)

A regressão rastreia as 602 verificações históricas, 2.355 casos matemáticos avançados, 305 comparações matemáticas CLI/WASM, 577 casos financeiros, 84 comparações financeiras independentes, 84 comparações financeiras CLI/WASM e 79 reexecuções de prova. As 36 simulações em lotes reproduziram a prova integral. O Chromium hospedado passou em 232 testes. A matriz de idiomas cobre 924 transições nos 22 módulos. O Windows físico passou nas 17 verificações históricas, nos cinco exemplos financeiros e nos sete científicos offline. [Regressão](regression.pt-BR.md) · [Chrome](browser.json) · [Idiomas](locale-transition-matrix.json) · [Windows](windows-method.pt-BR.md)

A cobertura científica de linhas no Linux foi de **96,00%** (6.822 de 7.106 linhas). Data Lab atingiu 95,38% e Optimization, 93,69%. Em Optimization, continuaram sem cobertura algumas saídas defensivas de iteração e de leitura de coeficientes. A revisão exercitou equivalência de chaves temporais, precisão, limites de saída e invariância de escala de restrições de programação linear. [Cobertura por arquivo](coverage.json)

### Desempenho e limites

Os testes utilizaram processos isolados, com três execuções por cenário. Os dois motores devolveram as somas exatas em todas as cargas admitidas. A 0.5.1 processou 100 mil linhas com o orçamento padrão de 192 MiB. Para 200 mil linhas de três colunas, esse orçamento recusou a carga, e o ensaio com 256 MiB concluiu importação, agrupamento e análise integralmente. Os recibos distinguem tempo de abertura, tempo adicional estimado do agrupamento, análise, RSS, memória privada, memória linear WASM e estimativas do motor. [Benchmarks](benchmarks.json) · [Modelo de recursos](resource-budget.pt-BR.md)

Medianas de três processos por cenário, em milissegundos. Cada par apresenta 0.5.0 → 0.5.1. A coluna de agrupamento é a diferença entre os tempos medianos de abertura com e sem o agrupamento.

| Linhas × colunas | Abertura e tipagem | Agrupamento adicional estimado | Perfil e prova | Pico de RSS (MiB) |
| --- | ---: | ---: | ---: | ---: |
| 1000 × 3 | 5,4 → 5,6 | 4,4 → 4,5 | 5,9 → 6,2 | 52,9 → 60,2 |
| 10000 × 3 | 16,0 → 18,0 | 12,2 → 8,7 | 10,8 → 10,9 | 59,0 → 64,8 |
| 100000 × 3 | 82,3 → 93,3 | 70,7 → 65,5 | 68,8 → 68,4 | 96,6 → 101,2 |
| 200000 × 3 | 180,8 → 181,5 | 137,5 → 133,3 | 140,8 → 129,9 | 132,4 → 135,5 |
| 1000 × 12 | 7,6 → 7,7 | 4,7 → 5,0 | 6,4 → 6,3 | 53,5 → 61,3 |
| 10000 × 12 | 36,4 → 34,9 | 14,4 → 10,0 | 15,1 → 11,9 | 65,3 → 72,1 |
| 1000 × 4 | 23,7 → 19,8 | 4,3 → 3,7 | 7,3 → 6,2 | 55,3 → 63,0 |

No modo básico visível, a mediana do conjunto de trabalho privado da árvore de processos foi de 121.049.088 bytes na 0.5.0 e 119.152.640 na 0.5.1. A meta de menos de 100 MB incrementais de RAM física continua em aberto. O emparelhamento e a variação de memória do sistema não isolam todas as páginas compartilhadas. As fórmulas de planilha utilizam o cache armazenado, que pode estar desatualizado. [Par Windows](windows-candidate.json) · [Acompanhamento de RAM](../../objective-02/revision-02/memory-debt.pt-BR.md) · [Segurança](security.pt-BR.md)

O commit de código passou nos quatro jobs. O commit final de evidências recebe uma execução própria no mesmo branch. O próximo passo é a nova auditoria independente do Objetivo 05. [Código auditado](https://github.com/daniloatila/universal-calculator-dars/commit/cda90d89ada0be4974655ccf746c78e3e61bc3bc) · [CI do código](https://github.com/daniloatila/universal-calculator-dars/actions/runs/45889156643)
