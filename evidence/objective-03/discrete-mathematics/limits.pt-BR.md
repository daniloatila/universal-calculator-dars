# Métodos e limites da Matemática Discreta

[English](limits.md)

O módulo aceita inteiros decimais com sinal usando a representação Rust existente de precisão arbitrária. A combinatória e os índices de sequência usam inteiros não negativos. Nomes de conjuntos e variáveis proposicionais usam gramáticas finitas próprias. Os resultados preservam inteiros exatos, inclusive além da precisão de máquina. A prova mantém a representação matemática informada para reprodução. [Analisador e aritmética](../../../crates/dars-universal/src/discrete_mathematics/integer.rs) · [Contrato de operações e prova](../../../crates/dars-universal/src/discrete_mathematics.rs)

| Operação | Entrada e resultado |
| --- | --- |
| Permutações | `n` retorna `n!`. Com `repetition=true`, informe as multiplicidades de um multiconjunto, como em `2 2 1`. O resultado conta ordenações distintas. |
| Arranjos | `n k` conta seleções ordenadas sem repetição por padrão. Com `repetition=true`, cada uma das `k` posições pode escolher qualquer um dos `n` elementos. |
| Combinações | `n k` conta seleções sem ordem. Com `repetition=true`, conta multiconjuntos de tamanho `k` sobre `n` tipos. Sem repetição, uma seleção maior que a população dá zero. A seleção vazia dá um nas duas operações de escolha. |
| Conjuntos finitos | União, interseção, diferença direcional, diferença simétrica e relação de subconjunto inclusiva. Separe por uma barra vertical dois conjuntos com elementos delimitados por espaços. Lados vazios representam conjuntos vazios. |
| Lógica e tabelas-verdade | Avalia uma expressão booleana com atribuições completas ou constrói sua tabela-verdade completa. Cada linha contém os bits de entrada seguidos do bit de saída. |
| Primalidade | Inteiro com sinal. Retorna `not_prime` abaixo de 2, `prime` ou `composite` exatos na faixa sem sinal de 64 bits, ou resultado de teste limitado de bases fixas para inteiros positivos maiores. |
| Fatoração | Inteiro não nulo com magnitude até `2^64-1`. Retorna lista ordenada de fatores primos com multiplicidade, iniciada por `-1` para entrada negativa. O produto vazio representa 1. |
| MDC e MMC | De 2 a 32 inteiros com sinal. Os resultados são não negativos. O MDC de entradas todas nulas é zero. Qualquer operando nulo torna o MMC zero. |
| Aritmética modular | `mode` aceita `remainder` por padrão, `add`, `mul`, `pow` ou `inverse`. Resto e inverso usam `a m`. Os demais modos usam `a b m`, com `b` como expoente de `pow`. Os resultados são os menores resíduos não negativos. |
| Sequências | `mode` aceita `fibonacci` por padrão, `lucas`, `arithmetic` ou `geometric`. Fibonacci e Lucas usam `n`. As sequências aritmética e geométrica usam o primeiro termo, a diferença ou razão e o índice. O primeiro índice é zero. |

## Conjuntos e gramática proposicional

Cada elemento de conjunto é um inteiro com sinal ou nome sensível a maiúsculas segundo `[A-Za-z][A-Za-z0-9_-]{0,31}`. Duplicatas usam identidade por valor, então `01` e `+1` representam um só inteiro. As listas ordenam inteiros por valor numérico e depois nomes em ordem ASCII. Por exemplo, a união de `3 1 a | 2 a` retorna `[1,2,3,"a"]`. [Conjuntos finitos](../../../crates/dars-universal/src/discrete_mathematics/sets.rs)

Variáveis proposicionais seguem `[A-Za-z][A-Za-z0-9_]{0,15}` e distinguem maiúsculas de minúsculas. Os nomes exatos em minúsculas `constructor` e `prototype` são reservados pela validação da prova e retornam `invalid_input`. Os literais são `true`, `false`, `1` e `0`. Nomes de operadores e constantes aceitam qualquer combinação de maiúsculas e minúsculas. Os parênteses alteram a precedência abaixo, ordenada da mais forte para a mais fraca.

1. Negação `!`, `¬` ou `NOT`.
2. Conjunção `&&`, `∧` ou `AND`.
3. Disjunção exclusiva `^`, `⊕` ou `XOR`.
4. Disjunção inclusiva `||`, `∨` ou `OR`.
5. Implicação `->`, `→`, `⇒` ou `IMPLIES`, que associa à direita.
6. Equivalência `<->`, `↔`, `⇔` ou `IFF`.

Uma requisição de lógica com variáveis usa uma atribuição por nome, como em `A && !B | A=1 B=0`. Atribuições excedentes, repetidas ou ausentes são inválidas. Expressões constantes podem omitir atribuições. A tabela-verdade recebe somente a expressão, ordena as colunas por nome e enumera as linhas com falso antes de verdadeiro. Uma constante tem uma linha e nenhuma coluna de entrada. O analisador monta uma árvore booleana tipada com um conjunto fixo de operadores. [Analisador e avaliador tipados](../../../crates/dars-universal/src/discrete_mathematics/logic.rs) · [Tabelas-verdade](https://openstax.org/books/contemporary-mathematics/pages/2-3-constructing-truth-tables) · [Implicação e equivalência](https://openstax.org/books/contemporary-mathematics/pages/2-4-truth-tables-for-the-conditional-and-biconditional)

## Primalidade, fatoração e aritmética

A primalidade verifica divisores primos pequenos e aplica o teste forte de Miller–Rabin com as primeiras 12 bases primas, de 2 a 37. Sorenson e Webster determinaram o primeiro pseudoprimo forte comum dessas bases, acima de `2^64-1`. O DARS usa a classificação determinística até esse limite sem sinal. Para entradas positivas maiores com até 1.024 bits, aprovação nos 12 testes retorna `probable_prime` com classificação aproximada. Um divisor ou falha em um teste forte ainda comprova composição e aparece na prova. As bases fixas não fornecem uma estimativa de probabilidade para bases aleatórias. Precisão numérica, tolerância e limite de erro ficam vazios. [Sorenson e Webster](https://arxiv.org/abs/1509.00864) · [Implementação de primalidade](../../../crates/dars-universal/src/discrete_mathematics/number_theory.rs)

Após remover os fatores primos pequenos, a fatoração usa busca limitada de Pollard rho com agrupamento de Brent e reinícios fixos. Ela separa resíduos compostos, verifica os fatores restantes pelo teste determinístico e recompõe a magnitude da entrada antes de retornar a lista ordenada. Os limites são 600.000 passos polinomiais no total, 120.000 por tentativa, 12 constantes de reinício candidatas e 64 passos por MDC em lote. O esgotamento da busca retorna `no_convergence`. O resultado bem-sucedido contém a fatoração completa verificada. [Trabalho de Brent](https://maths-people.anu.edu.au/~brent/pub/pub051.html) · [Fatoração limitada](../../../crates/dars-universal/src/discrete_mathematics/number_theory.rs)

O MDC usa redução euclidiana. O MMC divide pelo MDC antes de multiplicar. O inverso modular usa o algoritmo estendido de Euclides e exige módulo maior que um e coprimalidade. Todas as operações modulares exigem módulo positivo. Um expoente modular negativo aplica primeiro o inverso com as mesmas condições. Expoente zero usa a identidade multiplicativa reduzida módulo `m`. [Algoritmo de Euclides](https://math.dartmouth.edu/~trs/PreTeXtProjects/pretext-devel/sample-book/html-orig/section-division-algorithm.html) · [Implementação modular](../../../crates/dars-universal/src/discrete_mathematics/number_theory.rs)

A contagem usa produtos e recorrência binomial exata. Permutações de multiconjuntos multiplicam contagens binomiais sucessivas. Fibonacci usa duplicação rápida e os termos de Lucas seguem `L(n) = 2*F(n+1) - F(n)`. As sequências aritmética e geométrica usam fórmulas exatas com valores intermediários limitados. O índice zero da sequência geométrica retorna o primeiro termo mesmo quando a razão é zero. [Coeficientes binomiais](https://dlmf.nist.gov/26.3) · [Permutações de multiconjuntos](https://dlmf.nist.gov/26.16) · [Fibonacci e Lucas](https://dlmf.nist.gov/24.15) · [Algoritmos exatos](../../../crates/dars-universal/src/discrete_mathematics/integer.rs)

## Recursos e validação

- A requisição aceita até 4.096 bytes UTF-8. Literais inteiros admitem até 1.234 algarismos decimais e 4.096 bits de magnitude. Resultados inteiros limitados têm até 65.536 bits, com limite compartilhado de 32.768 bytes de texto.
- A contagem aceita `0 ≤ n, k ≤ 4096` e até 64 grupos de multiconjunto com no máximo 4.096 itens no total. Conjuntos aceitam até 128 tokens por lado antes de reunir duplicatas.
- Proposições aceitam até oito variáveis, 256 tokens e 32 níveis de análise aninhada. Tabelas-verdade têm até 256 linhas. O índice de sequência chega a 32.768. A potência modular limita a magnitude do expoente a 1.024 bits e o módulo a 2.048 bits.
- O navegador executa os mesmos algoritmos Rust em worker dedicado. O módulo processa requisições limitadas e usa o caminho compartilhado de cancelamento e recuperação de tarefas no aplicativo web. O CLI e o navegador retornam erros estruturados para sintaxe inválida, violações de domínio, limites de recursos e buscas limitadas sem sucesso. [Worker do navegador](../../../apps/web/src/tool-discrete-worker.ts) · [Limites compartilhados](../../../crates/dars-universal/src/lib.rs)

O módulo usa os crates de inteiros Num já fixados. A divisão por tentativa na faixa inteira de 64 bits exigiria muito mais divisões nos casos difíceis. A busca limitada de Brent atende entradas compostas maiores e preserva a verificação determinística do resultado. Os casos independentes comparam resultados exatos com Python e SymPy, percorrem atribuições booleanas, reconstroem números fatorados e distinguem resultados prováveis de classificações comprovadas. [Manifesto de features](../../../crates/dars-universal/Cargo.toml) · [Referência independente](../../../tests/verify-discrete-mathematics.py)
