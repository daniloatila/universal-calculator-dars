# Otimização

[English](contract.md)

O Calculation Proof `optimization/1` recebe uma expressão canônica em `x`, `y` e, quando aplicável, `z`. A avaliação em binary64 compila localmente a árvore sintática limitada do módulo Cálculo. A gramática real aceita literais decimais e científicos, aritmética, potências inteiras de −32 a 32, `sin`, `cos`, `tan`, `exp`, `ln`, `abs`, `sqrt`, `pi` e `e`. Os ângulos são expressos em radianos. O módulo reutiliza o parser, a aritmética racional e a serialização do DARS.

| Operações | Entradas e método | Estado e diagnóstico |
| --- | --- | --- |
| `bisection`, `hybrid` | `lower`, `upper` e `initial` opcional no híbrido. O método híbrido só aceita passos de Newton na região interna segura do intervalo. | Candidata a raiz, resíduo absoluto da função, contagem de iterações e motivo. Uma troca de sinal através de um domínio não resolvido não estabelece uma raiz. |
| `newton`, `secant` | `initial` e, para secante, `second`. Newton usa diferenciação automática direta na mesma árvore. | Inclinação nula ou indefinida, iterada indefinida, domínio não resolvido e limite de trabalho têm estados e motivos explícitos. |
| `minimize_univariate`, `maximize_univariate` | `lower` e `upper`. A busca por seção áurea pressupõe uma região adequada e compara os extremos originais. | Candidato local e largura final do intervalo. Podem existir outros mínimos ou máximos. |
| `gradient_descent`, `bfgs`, `nelder_mead` | `dimensions` igual a 2 ou 3, `initial`/`initial_y`/`initial_z` e limites opcionais por eixo. Gradiente projetado ou BFGS projetado com Armijo, ou busca limitada por simplex. | Ponto estacionário de primeira ordem ou candidato local do simplex. O resíduo identifica a norma infinita do gradiente projetado ou o diâmetro do simplex. Um ponto inicial fora dos limites retorna violação de restrição. |
| `linear_program` | `objective`, `constraints` e `sense` estruturados. Variáveis não negativas, 1–3 dimensões, até 12 restrições, `<=`, `>=`, `=`. Coeficientes racionais canônicos de até 112 bits no numerador e denominador. | Ótimo global exato, inviabilidade ou ilimitabilidade. As coordenadas e o objetivo exatos são os valores de referência. O booleano `alternative_optimum` indica a presença de vértices ótimos empatados ou de uma direção viável de ganho zero. O contador registra as combinações de restrições ativas examinadas. |

A magnitude das coordenadas contínuas é limitada a `10^12`. A tolerância numérica padrão é `10^-9` e a faixa é `10^-13` a `10^-2`. O limite de iterações varia de 1 a 4.096, com padrão 256. Os métodos de intervalo buscam uma raiz e podem terminar inconclusivamente se a verificação de domínio não estabelecer um trecho utilizável. Um resíduo impresso pequeno pode resultar de cancelamento. A verificação de resolução aritmética impede declarar convergência quando a aritmética disponível não resolve a tolerância solicitada. A prova mantém o campo de limite de erro vazio.

O poliedro viável com variáveis não negativas é pontiagudo. A enumeração exata de restrições ativas calcula a viabilidade dos vértices e o objetivo. Uma segunda enumeração intercepta o cone de recessão não negativo por `sum(d)=1`. Uma direção viável com ganho positivo demonstra ilimitabilidade na convenção de maximização. Uma direção de ganho zero em um ótimo finito demonstra alternativas. O escopo pequeno de propósito limita o trabalho combinatório.

Execute `python -B tests/verify-optimization.py target/release/dars.exe` na raiz. Com SciPy no ambiente Python, inclua `--scipy` para comparar independentemente com `brentq`, `minimize` e `linprog`. A suíte analítica cobre descontinuidade, cancelamento em binary64, função não convexa, ponto de sela, LP exato quase degenerado, inviabilidade, ilimitabilidade, limites, múltiplos ótimos e Rosenbrock. A auditoria integrada registra o cancelamento e a recuperação do worker no navegador.

[Referência de otimização do SciPy](https://docs.scipy.org/doc/scipy/reference/optimize.html) · [Equações não lineares no NIST DLMF](https://dlmf.nist.gov/3.8)
