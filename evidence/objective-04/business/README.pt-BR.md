# Evidências Empresariais · Objetivo 04

[English](README.md) · [Resultados independentes no CLI](cli-oracle.json)

## Modelo de cálculo

| Operação | Fórmula e escopo |
| --- | --- |
| Precificação | Markup é o lucro bruto dividido pelo custo unitário. A margem bruta é o lucro bruto dividido pelo preço de venda. O preço pode ser informado ou calculado por uma das duas metas. A contribuição deduz as despesas variáveis de venda. O arredondamento opcional de cotação ocorre antes do cálculo de sua margem. |
| Margens por competência | Receita menos custo da mercadoria vendida dá o lucro bruto. Receita menos custos variáveis dá a contribuição. O LAJIR e o resultado líquido incorporam as despesas e tributos informados separadamente. As margens usam a receita como base. |
| Ponto de equilíbrio | As unidades resultam da divisão do custo fixo pela contribuição unitária. O ponto financeiro deduz encargos fixos sem desembolso e soma os desembolsos fixos informados. A quantidade comercializável arredonda para cima. |
| Indicadores financeiros | ROI mede ganhos relativos ao custo. ROE e ROA usam o patrimônio e os ativos médios. ROIC usa NOPAT e o capital investido médio informado. Liquidez, passivo sobre ativo e capital de giro usam os saldos patrimoniais pertinentes. A liquidez seca exclui estoques e despesas antecipadas. |
| EBITDA | A conciliação sem ajustes da Resolução CVM 156 adiciona os tributos sobre o lucro e o resultado financeiro líquido ao resultado líquido para obter o LAJIR. A soma de depreciação, amortização e exaustão resulta no LAJIDA. |
| Ciclos operacional e financeiro | Os prazos de estoque, recebimento e pagamento dividem os saldos médios pelos volumes correspondentes do período. O ciclo operacional soma os prazos de estoque e recebimento. O ciclo financeiro deduz o prazo de pagamento. |
| Planejamento | O orçamento projeta receitas, custos e despesas por competência separadamente dos recebimentos, pagamentos e saldo de caixa. O desembolso inicial ocorre no período zero e o VPL desconta os fluxos seguintes. O resultado mostra valores pontuais do plano, valores realizados, diferenças e sensibilidade à taxa de crescimento da receita. |

Indicadores com denominador indisponível ou não positivo mostram o motivo. O ROE sinaliza patrimônio líquido não positivo em qualquer extremidade. Uma receita zero torna as margens indefinidas. Com contribuição unitária zero, custos fixos positivos não são recuperados. Ciclo financeiro, capital de giro e resultado líquido negativos podem ser válidos. A interpretação usa os mesmos períodos, as definições contábeis e o contexto da entidade.

Os cálculos usam números racionais exatos antes da apresentação. Valores monetários seguem a unidade mínima e a regra de arredondamento selecionadas. Razões e prazos têm apresentação com até 12 casas decimais. O período 1 usa os valores-base, o crescimento incide depois dele e as substituições valem somente para o período indicado. As observações do orçamento mantêm dados realizados separados do projeto. O sinal do VPL se refere aos fluxos e à taxa informados. O resultado também registra o menor caixa simulado, incluindo o período zero.

## Validação independente

O [oráculo Python do CLI](../../../tests/verify-investment-business.py) usa Decimal e Fraction da biblioteca padrão e executa o CLI no Windows com JSON estruturado. Ele confere resultados, metadados da prova e códigos de erro estáveis.

| Verificação | Resultado de referência |
| --- | --- |
| Exemplo obrigatório de preço | Custo unitário 100 e markup de 25% geram preço 125 e margem bruta de 20%. |
| Competência e caixa | Lucro bruto 100, contribuição 100, LAJIR 65, LAJIDA 70 e lucro líquido 55 sobre receita 200 com os custos do caso. Orçamento separado exibe lucro, caixa e fluxos descontados. |
| Conciliação CVM 156 | Resultado líquido 12 mais tributos 4 e despesa financeira líquida 3 formam LAJIR 19. O encargo adicional de 2 gera LAJIDA 21. |
| Pontos de equilíbrio contábil e financeiro | Ambos dividem encargos fixos pela mesma contribuição unitária. O ponto financeiro ajusta encargos de caixa antes da divisão. A contagem inteira arredonda para cima. |
| Valores nulos e com sinal | Identifica receita zero, volume zero e patrimônio não positivo. Cobre retornos com sinal, liquidez seca, capital de giro, ciclos financeiros positivo e negativo e VPL zero. |
| Limites | A paginação de resultados decimais extensos respeita o limite da prova. Premissas incompatíveis e limites excedidos retornam erros explícitos. |

```powershell
. .\scripts\dev-env.ps1
cargo build --locked -p dars-cli
python -X utf8 tests/verify-investment-business.py target/debug/dars.exe
```

## Referências

- O art. 3º da Resolução CVM 156 define os componentes de LAJIR e LAJIDA sem ajustes. [Publicação da CVM](https://conteudo.cvm.gov.br/legislacao/resolucoes/resol156.html) · [Íntegra da resolução](https://conteudo.cvm.gov.br/export/sites/cvm/legislacao/resolucoes/anexos/100/resol156.pdf)
- A U.S. Small Business Administration publica a fórmula de ponto de equilíbrio de um produto a partir do custo fixo e da contribuição unitária. [Calculadora da SBA](https://www.sba.gov/counseling/plan-your-business/break-even-point-calculator/)
- A IAS 7 descreve movimentos de caixa e os ajustes entre fluxo de caixa e resultado por competência. As premissas do orçamento são separadas para essas medidas. [IFRS Foundation, IAS 7](https://www.ifrs.org/issued-standards/list-of-standards/ias-7-statement-of-cash-flows.html/)
- O manual de finanças da OpenStax define capital de giro, liquidez seca e ciclo de conversão de caixa. [Capital de giro](https://openstax.org/books/principles-finance-2e/pages/19-1-what-is-working-capital)
