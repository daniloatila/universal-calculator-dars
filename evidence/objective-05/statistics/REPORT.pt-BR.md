# Estatística

O DARS 0.5.0 recebe requisições locais no esquema 1 para `statistics`. Envie o objeto JSON canônico como a string `input`. `proof.result` contém um objeto JSON serializado como string. A requisição preserva a notação original separadamente.

| Operação | Entrada | Método |
| --- | --- | --- |
| `descriptive` | `values`, `weights` e `percentiles` opcionais | Medidas de posição e dispersão racionais quando indicado, média geométrica, quartis, MAD, modas e possíveis outliers |
| `relationship` | `x` e `y` alinhados | Covariância centrada exata, correlação de Pearson e correlação de Spearman com postos médios |
| `regression` | `predictors` em linhas, `response` | Mínimos quadrados simples ou múltiplos com intercepto, centralização exata e escala por coluna antes da SVD limitada |
| `mean_test` | `values`, `null_mean` e `known_sd` opcionais | Teste t de uma amostra ou teste z com desvio-padrão populacional conhecido |
| `difference_test` | `x`, `y`, `paired` e `null_difference` opcionais | Teste t pareado nas diferenças ou teste t de Welch em grupos independentes |
| `proportion_test` | `successes`, `trials`, `p0` | Distribuição binomial exata sob H0 com caudas numéricas, intervalo de Wilson e h de Cohen |
| `chi_square` | `observed` e `expected` | Aderência de Pearson com frequências esperadas fixas e w de Cohen |
| `chi_square_independence` | `table` | Teste de independência de Pearson com V de Cramér sem correção de continuidade |
| `anova` | `groups` | ANOVA de um fator com efeitos fixos, teste global, eta quadrado e ômega quadrado |
| `rank_test` | `x` e `y` | U de Mann–Whitney assintótico com ajuste para empates e continuidade, efeito bisserial de postos |
| `sign_test` | `x` e `y` alinhados, `null_difference` opcional | Teste de sinais pareado com distribuição binomial exata sob H0 |

## Convenções e limites

- O módulo lê strings decimais canônicas e os tokens numéricos originais do JSON como racionais exatos. O limite por token é de 48 algarismos na mantissa, expoente escrito de magnitude até 100 e magnitude do valor até `1e100`. O envelope aceita até 4.096 bytes UTF-8. São até 512 observações por vetor e 32 percentis adicionais. A regressão aceita até 256 linhas e oito preditores dentro do limite em bytes.
- O padrão é a convenção amostral. `population: true` escolhe os denominadores populacionais. Quartis e percentis aceitam `type7` de Hyndman–Fan (linear, padrão) e `type1` (inversa empírica). Mediana e MAD usam interpolação pelo ponto médio. A MAD é o desvio absoluto mediano em relação à mediana, sem fator de escala. As cercas de Tukey sinalizam pontos fora de Q1 − 1,5 IQR e Q3 + 1,5 IQR. [Hyndman e Fan](https://robjhyndman.com/publications/quantiles/)
- Assimetria e curtose populacionais usam momentos centrados. A assimetria amostral usa Fisher–Pearson ajustado com pelo menos três observações. A curtose amostral tem correção de viés do quarto momento com pelo menos quatro observações. Configure `kurtosis` como `excess` ou `pearson`. Séries constantes deixam assimetria e curtose indefinidas. Média harmônica exige valores estritamente positivos, média geométrica aceita não negativos e coeficiente de variação exige média positiva.
- `missing` tem padrão `reject`. `omit` trata `null` como ausente e exclui o par ou a linha completa quando necessário. Pesos afetam apenas a média ponderada e devem ser não negativos, com soma positiva. Uma variável constante torna as correlações indefinidas. Os campos de `exact` complementam a apresentação em binary64 quando aplicável.
- A regressão informa o posto numérico com o intercepto e a estimativa da condição recíproca da matriz centrada e escalada. O limiar de posto é `max(n,k) × 32 × eps × maior valor singular`. Um modelo deficiente de posto informa o diagnóstico sem coeficientes. Uma condição recíproca de até `1e−8` indica um ajuste sensível. Os centros racionais ajudam a prever na forma centrada, especialmente quando o intercepto na origem extrapola os dados observados. Os resíduos conservam os índices de origem.
- `alpha` vai de `1e−12` a `0,5`, com padrão `0,05`. Testes direcionais aceitam `two_sided`, `less` ou `greater`. Diferenças pareadas são `x−y`. A prova registra pressupostos, valor-p, graus de liberdade e efeitos aplicáveis. Ambos os testes qui-quadrado exigem pelo menos cinco ocorrências esperadas por célula. Mann–Whitney exige pelo menos cinco observações em cada grupo. O teste de sinais exclui diferenças exatamente iguais à hipótese nula. Testes binomiais aceitam até um milhão de ensaios.
- Intervalos de confiança estimam grandezas populacionais sob os pressupostos informados. O valor-p é uma probabilidade de cauda sob a hipótese nula. A significância estatística, por si só, não estabelece causalidade. Intervalos, tolerâncias e precisão de trabalho ficam separados de qualquer erro certificado. [Manual estatístico do NIST](https://www.itl.nist.gov/div898/handbook/eda/section3/eda35.htm)

## Reprodução

Após compilar a CLI de lançamento, execute `python -B tests/verify-statistics.py target/release/dars.exe --out evidence/objective-05/statistics/tests.json` no ambiente bloqueado de testes científicos. `Fraction` verifica a precisão decimal preservada. NumPy e SciPy conferem momentos, postos, regressões, testes e intervalos. O ensaio compartilhado `tests/verify-simulation-targets.mjs` compara WASM isolado com a CLI. Consulte o [recibo de testes](tests.json) e a [aceitação](acceptance.json).

O motor reutiliza `num-bigint`, `num-rational`, `num-traits` e `nalgebra`. Usa `statrs` com os recursos opcionais padrão de amostragem e o nalgebra próprio desativados. A seleção reaproveita a SVD e a aritmética decimal do projeto e mantém funções especiais de inferência locais. [SVD do nalgebra](https://docs.rs/nalgebra/0.35.0/nalgebra/linalg/struct.SVD.html) · [Código-fonte do Statrs](https://github.com/statrs-dev/statrs/tree/v0.18.0)

A captura usa a amostra sintética 1, 2, 3, 4, 5. Ela mostra média 3, mediana 3 e variância amostral 2,5. [Captura do navegador](web.png)
