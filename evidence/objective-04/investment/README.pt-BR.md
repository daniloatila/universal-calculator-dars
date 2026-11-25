# Evidências de Investimentos · Objetivo 04

[English](README.md) · [Resultados independentes no CLI](cli-oracle.json)

## Modelo de cálculo

O motor Rust projeta saldos nominais e reais a partir do capital inicial, dos fluxos periódicos e das substituições pontuais por período. A entrada usa uma só moeda e expressa taxas efetivas em frações decimais. Por exemplo, `0.01` equivale a 1% por período. O cálculo aceita aportes e resgates no início ou no fim, reinvestimento ou distribuição de rendimentos líquidos positivos, custos, tributos, inflação e datas.

Em cada período, o rendimento bruto usa o saldo após os fluxos de abertura. A tarifa percentual incide sobre o saldo após o rendimento, acrescida da tarifa fixa. O tributo simulado incide sobre o rendimento bruto positivo. Os fluxos de fechamento ocorrem após rendimentos, custos e distribuições. A projeção bruta usa os mesmos fluxos externos e política de distribuição, com custos e tributos zerados. O lucro real deflaciona aportes, resgates e distribuições nas respectivas datas. As taxas de retorno simples dividem o lucro correspondente pelo capital aportado, com deflação de cada aporte no retorno real. Os valores monetários usam aritmética racional e o arredondamento de apresentação selecionado.

| Produto | Cálculo e premissas disponíveis |
| --- | --- |
| Genérico | Taxa efetiva por período com unidade explícita. Aceita período, dia corrido, dia útil, mês, trimestre ou ano. |
| CDB, RDB, LCI, LCA | Retorno efetivo manual, DI diário efetivo vezes o percentual contratado, ou IPCA e taxa adicional do mesmo período. O RDB é intransferível, o lastro da LCI é imobiliário e o da LCA está no agronegócio. Precisão contratual, carência e condições do emissor dependem do contrato. |
| Tesouro Prefixado | Projeção patrimonial na taxa efetiva informada por período. O resultado identifica a projeção até o vencimento. |
| Tesouro Selic e Tesouro IPCA+ | Projeção por `(1 + índice) × (1 + adicional) − 1`, com ambas as taxas do mesmo período. O IPCA informado também é o deflator real padrão. A avaliação da venda antecipada exige cotação efetiva. |
| Poupança | Taxas manuais por aniversário, inclusive valores históricos publicados, ou remuneração mensal calculada por Selic e TR para depósitos elegíveis desde 4 de maio de 2012. Um período inicial incompleto rende zero. Aplicações nos dias 29 a 31 têm como data-base o dia 1º do mês seguinte. |

Acima de 8,5% de Selic anual, o cálculo de poupança usa remuneração adicional de 0,5% ao mês. Até 8,5%, converte 70% da meta anual para o fator mensal composto. Essa segunda faixa recebe indicação de aproximação quando o motor usa o limite inferior de 18 casas decimais. A TR e o fator adicional são compostos. O modelo representa um grupo de depósitos com o mesmo aniversário mensal, aplicável a pessoas físicas ou entidades sem fins lucrativos, com fluxos nas fronteiras dos períodos. Depósitos de outros aniversários, movimentos dentro do período e convenções bancárias de crédito têm tratamento próprio.

Cenários indexados e de poupança exigem fonte manual e data de referência ISO. O resultado e a prova registram esses dados. O cálculo funciona offline. Regras tributárias efetivas, garantias, custódia, cupons, avaliação por cotação e restrições de resgate ficam fora desta projeção. O Comparador de Cenários permite variar premissas entre resultados calculados separadamente.

## Validação independente

O [oráculo Python do CLI](../../../tests/verify-investment-business.py) usa Decimal e Fraction da biblioteca padrão, fórmulas fechadas de anuidades, casos públicos de referência e comparações monetárias exatas. A execução usa o CLI nativo no Windows e confere a prova em JSON e os códigos de erro estáveis.

| Verificação | Resultado de referência |
| --- | --- |
| Poupança do Banco Central, 1 a 31 mar. 2001 | R$ 500,00 no fim. Nenhum período completo de crédito. |
| Poupança do Banco Central, 17 mai. a 30 ago. 2002 | R$ 10.221,87 a partir de três créditos de 0,6683%, 0,7516% e 0,7826%. |
| Faixa da Selic e aniversário em ano bissexto | Taxa zero, abaixo, igual e acima de 8,5%. O depósito de 31 jan. 2024 completa o primeiro período em 1 mar. 2024. |
| Percentual do DI e calendário | 105% de DI diário efetivo sintético de 0,04%, com exclusão do fim de semana e de um feriado informado. |
| Fórmula fechada, fluxos variáveis e apresentação | Aportes no início e no fim, taxas zero e negativas, deflação, tributos, custos, reinvestimento, arredondamento, paginação e rejeições. |

```powershell
. .\scripts\dev-env.ps1
cargo build --locked -p dars-cli
python -X utf8 tests/verify-investment-business.py target/debug/dars.exe
```

## Fontes primárias

- Banco Central do Brasil publica a metodologia da poupança por períodos completos e os dois exemplos numéricos. A FAQ trata das aplicações nos dias 29 a 31. [Metodologia e exemplos](https://www3.bcb.gov.br/CALCIDADAO/publico/metodologiaCorrigirPelaPoupanca.do?method=metodologiaCorrigirPelaPoupanca) · [FAQ sobre aniversário](https://www.bcb.gov.br/meubc/faqs/p/posso-abrir-caderneta-de-poupanca-nos-dias-29-30-e-31-qual-a-diferenca)
- A faixa da Selic e o crédito na conta têm como referências a Lei 12.703, o Banco Central e o regulamento da Caixa. [Lei 12.703/2012](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2012/lei/l12703.htm) · [Remuneração segundo o Banco Central](https://www.bcb.gov.br/estatisticas/remuneradepositospoupanca) · [Regulamento da Caixa](https://www.caixa.gov.br/Downloads/poupanca-integrada/regulamento-poupanca.pdf)
- A B3 documenta o DI, a liquidação do CDB e as características de produtos privados. O teste do motor usa uma taxa diária sintética e um feriado informado. [Metodologia do DI](https://www.b3.com.br/pt_br/market-data-e-indices/indices/indices-de-segmentos-e-setoriais/di/metodologia-de-calculo-do-indice-di/) · [Manual do CDB](https://www.b3.com.br/data/files/E9/24/20/40/0D331610D1820216790D8AA8/Manual-do-Produto-Certificado-de-Deposito-Bancario-CDB.pdf) · [RDB](https://www.b3.com.br/pt_br/produtos-e-servicos/registro/renda-fixa-e-valores-mobiliarios/recibo-de-deposito-bancario.htm) · [LCI](https://www.b3.com.br/pt_br/produtos-e-servicos/central-depositaria/renda-fixa-e-valores-mobiliarios/letra-de-credito-imobiliario.htm) · [LCA](https://www.b3.com.br/pt_br/produtos-e-servicos/registro/renda-fixa-e-valores-mobiliarios/letras-de-credito-do-agronegocio.htm)
- Tesouro Direto explica vencimento e resgate antecipado. O IBGE define inflação e o índice dos exemplos de valor real. O Banco Central publica a fórmula de depósitos no início de cada período. [Regras do Tesouro](https://www.tesourodireto.com.br/sobre-o-tesouro/regras-e-regulamento) · [Inflação no IBGE](https://www.ibge.gov.br/explica/inflacao.php) · [Depósitos regulares no Banco Central](https://www3.bcb.gov.br/CALCIDADAO/publico/exibirMetodologiaAplicacaoDepositosRegulares.do?method=exibirMetodologiaAplicacaoDepositosRegulares)
