# Probabilidade

Envie o identificador da distribuição e o objeto de parâmetros a `probability` / `distribution` na string JSON `input`. A resposta informa os momentos finitos. `x` solicita massa ou densidade, acumulada `P(X ≤ x)` e sobrevivência `P(X > x)`. Envie `lower` e `upper` juntos para `P(lower ≤ X ≤ upper)`, `probability` para a inversa generalizada da acumulada, `sample_count` com `seed` para gerar amostras e `plot_points` para coordenadas do gráfico. As consultas são opcionais.

| Distribuição | Parâmetros | Convenção |
| --- | --- | --- |
| `bernoulli` | `p` | Suporte 0 e 1 |
| `binomial` | `n`, `p` | Sucessos em `n` ensaios |
| `negative_binomial` | `r`, `p` | Falhas antes de `r` sucessos quando `r` é inteiro. A distribuição também aceita parâmetros de forma reais positivos. |
| `geometric` | `p` | Ensaios até o primeiro sucesso, a partir de 1 |
| `poisson` | `lambda` | Taxa não negativa de eventos |
| `hypergeometric` | `population`, `successes`, `draws` | Amostragem sem reposição |
| `discrete_uniform` | `minimum`, `maximum` | Extremos inteiros inclusivos |
| `uniform` | `minimum`, `maximum` | Suporte contínuo com extremos distintos |
| `normal` | `mean`, `sd` | Desvio-padrão positivo |
| `lognormal` | `log_mean`, `log_sd` | Parâmetros da normal em escala de logaritmo natural |
| `exponential` | `rate` | Média `1/rate` |
| `gamma` | `shape`, `rate` | Taxa igual ao inverso da escala |
| `beta` | `alpha`, `beta` | Formas positivas em [0, 1] |
| `weibull` | `shape`, `scale` | Forma e escala positivas |
| `student_t` | `df` | Centro zero, escala um |
| `chi_squared` | `df` | Graus de liberdade positivos |
| `fisher_f` | `df1`, `df2` | Graus de liberdade do numerador e do denominador |

`events` usa `p_a`, `p_b` e `p_ab`. Retorna interseção, união, complementos, as duas condicionais, a reformulação de Bayes e o teste de independência com comparação relativa de quatro épsilons. O motor rejeita interseções fora dos limites de Fréchet. Uma condição de probabilidade zero produz `null` para a condicional correspondente.

## Algoritmos e precisão

- A densidade contínua mede probabilidade por unidade de `x` e pode ser maior que um. A massa discreta é a probabilidade de um ponto. A acumulada e a sobrevivência discretas usam o maior inteiro menor ou igual a `x`. O gráfico usa densidade no intervalo central de 99% ou massas individuais em inteiros selecionados. O gráfico discreto pode omitir pontos do suporte quando usa um passo maior que um.
- As caudas superiores usam sobrevivência direta e argumentos complementares da função beta. A fração de Lentz modificada permite até 4.096 iterações, limita a diferença do fator convergente a oito épsilons de binary64 e informa a falha de convergência. O logaritmo normalizado da beta evita cancelamento em probabilidades pequenas. Quantis contínuos usam expansão e bisseção com verificação do resíduo relativo na borda do intervalo de ponto flutuante. Os limites são 1.024 expansões e 1.100 refinamentos. A prova registra precisão aproximada e não fornece erro certificado. [Beta incompleta no DLMF do NIST](https://dlmf.nist.gov/8.17) · [Assíntotas da gamma no DLMF do NIST](https://dlmf.nist.gov/5.11)
- A binomial com `p = 0,5` e `n ≤ 52` usa somas inteiras e distingue saltos diádicos exatos da acumulada e seus vizinhos imediatos. Os casos independentes incluem a região central de uma binomial com um milhão de ensaios, beta simétrica e assimétrica, sobrevivência normal a mais de 14 desvios-padrão, cauda superior F e acumulada gamma próxima de zero. As comparações regulares usam até `3e−8` de tolerância relativa e `2e−14` absoluta. O mpmath testa caudas extremas sem piso absoluto. Caudas e amostras extremas podem sofrer arredondamento nos limites de binary64. Extremos infinitos, momentos e densidades indisponíveis usam `null` com o motivo no resultado.
- Limites de 4.096 bytes por entrada, 128 amostras e 129 pontos de gráfico. A binomial permite até um milhão de ensaios, Poisson até um milhão na taxa e a hipergeométrica até 5.000 indivíduos. Os extremos da uniforme discreta têm magnitude máxima `1e9`. A busca discreta em suportes ilimitados vai até `1e15`. Formas e graus de liberdade ficam em `1e−4..1e4`. Para lognormal, `abs(log_mean) ≤ 100` e `log_sd ≤ 50`. Outros escalares não nulos têm magnitude entre `1e−100` e `1e100`. Entradas inválidas, duplicadas, não suportadas ou excessivas produzem erros estáveis.

Statrs 0.18.0 fornece definições e funções selecionadas com amostragem padrão e nalgebra opcional desativados. O DARS implementa a fração beta limitada compartilhada e trata diretamente as caudas sensíveis. Libm 0.2.16 fornece transformações de amostragem determinísticas sem entropia do sistema. A amostragem compartilha a receita PCG com [Simulação](../simulation/REPORT.pt-BR.md). [Código do Statrs](https://github.com/statrs-dev/statrs/tree/v0.18.0) · [Código da Libm](https://docs.rs/crate/libm/0.2.16)

## Reprodução

Execute `python -B tests/verify-probability.py target/release/dars.exe --out evidence/objective-05/probability/tests.json` com as dependências de teste SciPy e mpmath fixadas. A suíte verifica as 17 famílias por referências independentes e analíticas, suporte, complementaridade, monotonicidade, consistência de quantis e repetição da semente. `tests/verify-simulation-targets.mjs` compara CLI e WASM isolado. Consulte o [recibo de testes](tests.json) e a [aceitação](acceptance.json).

A captura usa a distribuição normal padrão em `x = 0` e mostra densidade e probabilidade acumulada em campos distintos. [Captura do navegador](web.png)
