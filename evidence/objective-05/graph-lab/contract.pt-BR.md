# Laboratório de Gráficos

[English](contract.md)

`graph-lab/1` compila fórmulas reais limitadas com o parser existente do módulo Cálculo. A requisição usa fórmulas canônicas. O módulo aceita literais decimais e científicos, `pi`, `e`, aritmética, potências inteiras de −32 a 32, `sin`, `cos`, `tan`, `exp`, `ln`, `abs` e `sqrt`. Os ângulos usam radianos. Os parâmetros interativos `a`, `b`, `c` têm padrão 1, 0, 0.

| Operação | Fórmula de entrada | Saída |
| --- | --- | --- |
| `explicit` | `expressions` com uma a quatro fórmulas em `x` | Caminhos independentes em duas coordenadas. `find_roots` e `find_intersections` opcionais solicitam candidatos numéricos. |
| `parametric` | Fórmulas `x` e `y` em `t` | Caminho em duas coordenadas. |
| `polar` | `r` em `t` | Caminho cartesiano derivado de `r(t)` e do ângulo `t`. |
| `implicit` | `expression` em `x,y` | Curva de nível zero, amostrada por marching squares com avaliação do centro em células ambíguas. |
| `surface` | `expression` em `x,y` | `grid.x`, `grid.y`, `grid.z[y][x]`, com vértices indefinidos ou mascarados iguais a `null`. |
| `space_curve` | Fórmulas `x`, `y` e `z` em `t` | Caminho em três coordenadas. |

Os caminhos usam `series[].points` e `null` interrompe a polilinha. Cada segmento implícito tem um separador `null`. O motor verifica o domínio de intervalos antes de conectar amostras, inclusive quando um polo entre amostras pode ser identificado. Oscilações trigonométricas sem resolução, magnitudes fora da faixa ou células com domínio incerto geram lacunas e avisos. Contornos podem ser parciais ao atingir o limite de segmentos. A grade pode omitir feições estreitas, pontos isolados ou contornos sem troca de sinal. O resultado tem teto de 32 KiB. Eixos e saídas têm magnitude máxima `10^12`. Cada curva aceita 16 a 256 amostras, com até 512 no conjunto de curvas explícitas. Grades aceitam 8 a 32 amostras por eixo, com padrão 24.

A busca de raízes e interseções usa 128 painéis fixos, até 50 bisseções por candidato, até 12 candidatos por curva ou par e tolerância aproximada de resíduo absoluto de `10^-8`. Alterações apenas na amostragem visual mantêm os resultados dessa busca. A busca pode omitir raízes sem troca de sinal e feições entre amostras. Uma verificação numérica impede retornar candidatos quando cancelamento impede resolver um resíduo computado pequeno. O Calculation Proof registra entrada, método, precisão e hipóteses da busca. O campo de limite de erro fica vazio.

Execute `python -B tests/verify-graph-lab.py target/release/dars.exe` na raiz para verificar caminhos analíticos, superfícies, contornos, separação em polos, domínio e invariância em relação à amostragem visual. Os controles do navegador, recuperação de contexto, exportações, renderização leve e ciclo de vida são registrados na auditoria integrada.

[Interpolação no NIST DLMF](https://dlmf.nist.gov/3.3) · [Equações não lineares no NIST DLMF](https://dlmf.nist.gov/3.8)
